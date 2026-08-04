package agents

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"mypal/api/go/internal/ai/llm"
)

// CatalogProduct is one row of the active catalogue, as the listings service returns it.
type CatalogProduct struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Category string  `json:"category"`
	Price    float64 `json:"price"`
	Image    *string `json:"image"`
}

// ProdRecommender mirrors the notebook's ProdBERT + LLM re-ranking pipeline.
//
//	Step 1: get embeddings from the Go embedding service (ProdBERT).
//	Step 2: cosine similarity to find top-K candidates.
//	Step 3: LLM re-ranking for contextual precision.
type ProdRecommender struct {
	provider    *llm.Provider
	prodBertURL string
	client      *http.Client
}

func NewProdRecommender(p *llm.Provider) *ProdRecommender {
	url := os.Getenv("PRODBERT_URL")
	if url == "" {
		url = "http://localhost:8001"
	}
	return &ProdRecommender{
		provider:    p,
		prodBertURL: strings.TrimRight(url, "/"),
		client:      &http.Client{Timeout: 15 * time.Second},
	}
}

func (r *ProdRecommender) getEmbeddings(ctx context.Context, texts []string) [][]float64 {
	body, err := json.Marshal(map[string][]string{"texts": texts})
	if err != nil {
		return nil
	}

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, r.prodBertURL+"/embed", bytes.NewReader(body))
	if err != nil {
		return nil
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}
	var payload struct {
		Embeddings [][]float64 `json:"embeddings"`
	}
	if json.Unmarshal(raw, &payload) != nil {
		return nil
	}
	return payload.Embeddings
}

func cosineSimilarity(a, b []float64) float64 {
	var dot, normA, normB float64
	for i, v := range a {
		var bv float64
		if i < len(b) {
			bv = b[i]
		}
		dot += v * bv
		normA += v * v
	}
	for _, v := range b {
		normB += v * v
	}
	normA, normB = math.Sqrt(normA), math.Sqrt(normB)
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (normA * normB)
}

// Recommend returns the LLM's raw pick — a JSON array of product IDs in ranked
// order. The caller maps them back to catalogue records.
func (r *ProdRecommender) Recommend(ctx context.Context, userPersona string, catalog []CatalogProduct) string {
	catalogTexts := make([]string, 0, len(catalog))
	for _, p := range catalog {
		catalogTexts = append(catalogTexts, p.Title+" "+p.Category)
	}

	embeddings := r.getEmbeddings(ctx, append([]string{userPersona}, catalogTexts...))

	candidates := catalog
	if len(embeddings) == len(catalog)+1 {
		personaVec := embeddings[0]
		type scored struct {
			score float64
			index int
		}
		ranked := make([]scored, 0, len(catalog))
		for i, vec := range embeddings[1:] {
			ranked = append(ranked, scored{cosineSimilarity(personaVec, vec), i})
		}
		sort.SliceStable(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })
		if len(ranked) > 10 {
			ranked = ranked[:10]
		}
		candidates = make([]CatalogProduct, 0, len(ranked))
		for _, s := range ranked {
			candidates = append(candidates, catalog[s.index])
		}
	}

	candidateJSON := make([]map[string]any, 0, len(candidates))
	for _, c := range candidates {
		candidateJSON = append(candidateJSON, map[string]any{"id": c.ID, "name": c.Title})
	}
	encoded, _ := json.Marshal(candidateJSON)

	prompt := fmt.Sprintf(`USER CONTEXT: %s
PRODUCTS: %s

Pick the top 3 products most relevant to the user context.
Return ONLY a JSON array of product IDs in order of relevance.
Example: [4, 12, 1]`, userPersona, string(encoded))

	out, _ := r.provider.Chat(ctx, "gemini-flash",
		[]llm.Message{{Role: "user", Content: prompt}},
		llm.Options{ResponseFormat: "json"})
	return out
}
