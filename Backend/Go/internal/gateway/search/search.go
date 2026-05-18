// Package search implements the full Phase 2 semantic search orchestration:
//
//	Frontend → Gateway → SSQL Middleware → ProdBERT /embed
//	→ PostgreSQL pgvector cosine search → Hybrid Ranking → Explainability → Response
//
// SSQL validation is enforced by middleware before this handler is invoked.
// The Gateway orchestrates but does not own the canonical data.
package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mypal/api/go/internal/gateway/ranking"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/tracing"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Config carries all upstream URLs and pool references for search orchestration.
type Config struct {
	ProdBERTURL   string
	InternalToken string
	EmbedTimeout  time.Duration
	DBPool        *pgxpool.Pool // optional: nil triggers degraded mode
}

// SearchRequest is the expected JSON body (POST) or query param (GET).
type SearchRequest struct {
	Query  string `json:"q"`
	Limit  int    `json:"limit,omitempty"`
	Offset int    `json:"offset,omitempty"`
}

// EmbedRequest / EmbedResponse — ProdBERT wire types.
type EmbedRequest struct {
	Texts []string `json:"texts"`
}
type EmbedResponse struct {
	Embeddings [][]float64 `json:"embeddings"`
}

// SearchResponse is the canonical API response shape.
type SearchResponse struct {
	Query      string                `json:"query"`
	Total      int                   `json:"total"`
	Results    []ranking.RankedResult `json:"results"`
	Mode       string                `json:"mode"`
	TraceID    string                `json:"trace_id"`
	LatencyMs  map[string]int64      `json:"latency_ms"`
}

// Handler returns the full Phase 2 semantic search orchestration handler.
func Handler(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		timings := make(map[string]int64)

		// ── Parse request ──────────────────────────────────────────────
		var sreq SearchRequest
		if r.Method == http.MethodPost {
			if err := json.NewDecoder(r.Body).Decode(&sreq); err != nil {
				responses.Error(w, http.StatusBadRequest,
					responses.CodeInvalidQuery, "invalid request body", traceID)
				return
			}
		} else {
			sreq.Query = r.URL.Query().Get("q")
		}

		if sreq.Query == "" {
			responses.Error(w, http.StatusBadRequest,
				responses.CodeInvalidQuery, "'q' parameter is required", traceID)
			return
		}

		limit := sreq.Limit
		if limit <= 0 || limit > 50 {
			limit = 20
		}

		slog.Info("search: start", "query", sreq.Query, "limit", limit, "trace_id", traceID)
		t0 := time.Now()

		// ── Step 1: Embed query via ProdBERT ───────────────────────────
		t1 := time.Now()
		embedding, err := embedQuery(r.Context(), cfg, sreq.Query, traceID)
		timings["embed_ms"] = time.Since(t1).Milliseconds()

		if err != nil {
			slog.Warn("search: embedding failed, entering degraded mode",
				"err", err, "trace_id", traceID)
			responses.OK(w, SearchResponse{
				Query:     sreq.Query,
				Total:     0,
				Results:   []ranking.RankedResult{},
				Mode:      "degraded_no_embedding",
				TraceID:   traceID,
				LatencyMs: timings,
			})
			return
		}

		slog.Info("search: embedding done",
			"dims", len(embedding), "latency_ms", timings["embed_ms"], "trace_id", traceID)

		// ── Step 2: pgvector cosine similarity search ───────────────────
		var rawProducts []ranking.RawProduct
		mode := "vector_only"

		if cfg.DBPool != nil {
			t2 := time.Now()
			rawProducts, err = vectorSearch(r.Context(), cfg.DBPool, embedding, limit, traceID)
			timings["pgvector_ms"] = time.Since(t2).Milliseconds()
			if err != nil {
				slog.Warn("search: pgvector query failed, returning empty",
					"err", err, "trace_id", traceID)
				rawProducts = []ranking.RawProduct{}
				mode = "degraded_db_error"
			} else {
				mode = "hybrid"
			}
		} else {
			slog.Warn("search: no DB pool configured, skipping vector search", "trace_id", traceID)
			mode = "degraded_no_db"
		}

		// ── Step 3: Hybrid Ranking ──────────────────────────────────────
		t3 := time.Now()
		ranked := ranking.Rank(sreq.Query, rawProducts)
		timings["rank_ms"] = time.Since(t3).Milliseconds()
		timings["total_ms"] = time.Since(t0).Milliseconds()

		slog.Info("search: complete",
			"results", len(ranked),
			"mode", mode,
			"total_ms", timings["total_ms"],
			"trace_id", traceID,
		)

		responses.OK(w, SearchResponse{
			Query:     sreq.Query,
			Total:     len(ranked),
			Results:   ranked,
			Mode:      mode,
			TraceID:   traceID,
			LatencyMs: timings,
		})
	}
}

// ─── ProdBERT Embedding ─────────────────────────────────────────────────────

func embedQuery(ctx context.Context, cfg Config, query, traceID string) ([]float64, error) {
	embedCtx, cancel := context.WithTimeout(ctx, cfg.EmbedTimeout)
	defer cancel()

	body, err := json.Marshal(EmbedRequest{Texts: []string{query}})
	if err != nil {
		return nil, fmt.Errorf("embed marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(embedCtx, http.MethodPost,
		cfg.ProdBERTURL+"/embed", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("embed request build: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	tracing.InjectHeaders(req, traceID, "")

	resp, err := (&http.Client{Timeout: cfg.EmbedTimeout}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("embed call: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var embedResp EmbedResponse
	if err := json.Unmarshal(raw, &embedResp); err != nil {
		return nil, fmt.Errorf("embed parse: %w", err)
	}
	if len(embedResp.Embeddings) == 0 {
		return nil, fmt.Errorf("embed: empty response")
	}
	return embedResp.Embeddings[0], nil
}

// ─── pgvector Search ────────────────────────────────────────────────────────

// vectorSearch executes a cosine similarity search against public.product_embeddings.
// It joins to public.products to fetch the columns needed by the ranker.
// The embedding column is vector(384) using the pgvector extension.
const vectorSearchSQL = `
SELECT
    p.id,
    p.name,
    COALESCE(p.description, '') AS description,
    COALESCE(p.category, '')    AS category,
    COALESCE(p.current_price, 0) AS price,
    1 - (pe.embedding <=> $1::vector) AS vector_score,
    COALESCE(p.created_at, now())      AS created_at
FROM public.product_embeddings pe
JOIN public.products p ON p.id = pe.product_id
WHERE p.is_deleted IS NOT TRUE
ORDER BY pe.embedding <=> $1::vector
LIMIT $2`

func vectorSearch(
	ctx context.Context,
	pool *pgxpool.Pool,
	embedding []float64,
	limit int,
	traceID string,
) ([]ranking.RawProduct, error) {
	// Format embedding as a pgvector literal: '[0.1,0.2,...]'
	vecLiteral := formatVector(embedding)

	rows, err := pool.Query(ctx, vectorSearchSQL, vecLiteral, limit)
	if err != nil {
		slog.Error("search: pgvector query error", "err", err, "trace_id", traceID)
		return nil, fmt.Errorf("pgvector query: %w", err)
	}
	defer rows.Close()

	var products []ranking.RawProduct
	for rows.Next() {
		var p ranking.RawProduct
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.Category,
			&p.Price, &p.VectorScore, &p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("pgvector scan: %w", err)
		}
		// Placeholder for ImageURL since real media join is Phase 3
		p.ImageURL = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop"
		products = append(products, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("pgvector rows: %w", err)
	}
	return products, nil
}

// formatVector converts a float64 slice to the pgvector wire literal '[x,y,z,...]'.
func formatVector(v []float64) string {
	if len(v) == 0 {
		return "[]"
	}
	buf := bytes.NewBufferString("[")
	for i, f := range v {
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.WriteString(fmt.Sprintf("%.8f", f))
	}
	buf.WriteByte(']')
	return buf.String()
}
