// Command embed is the MyPal Go Embedding Service.
// It replaces the former Python ProdBERT service, providing /embed and /rank
// endpoints at dimension 384 for pgvector compatibility.
//
// Embedding strategy (in priority order):
//  1. HuggingFace Inference API  (HUGGING_FACE_API_KEY set, 384-dim, same model)
//  2. Hash-based fallback         (character n-gram + word hashing, 384-dim, pure Go)
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

const embedDim = 384

// ─── Wire types ─────────────────────────────────────────────────────────────

type EmbedRequest struct {
	Texts []string `json:"texts"`
}

type EmbedResponse struct {
	Embeddings [][]float64 `json:"embeddings"`
}

type RankCandidate struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type RankRequest struct {
	Query      string          `json:"query"`
	Candidates []RankCandidate `json:"candidates"`
	TopK       int             `json:"top_k"`
}

type RankedItem struct {
	ID    string  `json:"id"`
	Score float64 `json:"score"`
}

type RankResponse struct {
	Ranked []RankedItem `json:"ranked"`
}

// ─── Hash-based embedding (pure Go, 384-dim) ────────────────────────────────

// hashEmbed produces a deterministic L2-normalized 384-dim vector using
// character 4-grams and word unigrams hashed into fixed buckets.
// Semantically weaker than transformer models but zero-dependency and fast.
func hashEmbed(text string) []float64 {
	text = strings.ToLower(strings.TrimSpace(text))
	if text == "" {
		return make([]float64, embedDim)
	}
	vec := make([]float64, embedDim)

	// Character 4-grams capture subword morphology.
	padded := " " + text + " "
	for i := 0; i+4 <= len(padded); i++ {
		gram := padded[i : i+4]
		h := fnv.New32a()
		h.Write([]byte(gram))
		vec[int(h.Sum32()%uint32(embedDim))] += 1.0
	}

	// Word unigrams weighted 2× for stronger lexical signal.
	for _, word := range strings.Fields(text) {
		word = strings.Trim(word, `.,!?;:"'()-`)
		if word == "" {
			continue
		}
		h := fnv.New32a()
		h.Write([]byte(word))
		vec[int(h.Sum32()%uint32(embedDim))] += 2.0
	}

	return l2Normalize(vec)
}

func l2Normalize(vec []float64) []float64 {
	var norm float64
	for _, v := range vec {
		norm += v * v
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		return vec
	}
	out := make([]float64, len(vec))
	for i, v := range vec {
		out[i] = v / norm
	}
	return out
}

// ─── HuggingFace Inference API ───────────────────────────────────────────────

func callHuggingFaceEmbed(ctx context.Context, texts []string, apiKey string) ([][]float64, error) {
	model := os.Getenv("EMBED_MODEL")
	if model == "" {
		model = "sentence-transformers/paraphrase-MiniLM-L3-v2"
	}

	type hfReq struct {
		Input []string `json:"input"`
		Model string   `json:"model"`
	}
	type hfItem struct {
		Embedding []float64 `json:"embedding"`
	}
	type hfResp struct {
		Data []hfItem `json:"data"`
	}

	body, _ := json.Marshal(hfReq{Input: texts, Model: model})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://router.huggingface.co/v1/embeddings", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("call HF: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HF API %d: %s", resp.StatusCode, string(raw))
	}

	var result hfResp
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("parse HF response: %w", err)
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("HF returned empty embeddings")
	}

	embeddings := make([][]float64, len(result.Data))
	for i, d := range result.Data {
		embeddings[i] = d.Embedding
	}
	return embeddings, nil
}

// ─── Embedding dispatcher ────────────────────────────────────────────────────

func embedTexts(ctx context.Context, texts []string) [][]float64 {
	if apiKey := os.Getenv("HUGGING_FACE_API_KEY"); apiKey != "" {
		if embeddings, err := callHuggingFaceEmbed(ctx, texts, apiKey); err == nil {
			return embeddings
		} else {
			slog.Warn("embed: HuggingFace failed, using hash fallback", "err", err)
		}
	}

	result := make([][]float64, len(texts))
	for i, t := range texts {
		result[i] = hashEmbed(t)
	}
	return result
}

// ─── Cosine similarity ───────────────────────────────────────────────────────

func cosineSim(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	d := math.Sqrt(normA) * math.Sqrt(normB)
	if d == 0 {
		return 0
	}
	return dot / d
}

// ─── HTTP handlers ───────────────────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok","service":"go-embed"}`))
}

func embedHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req EmbedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Texts) == 0 {
		http.Error(w, `{"error":"texts array required"}`, http.StatusBadRequest)
		return
	}

	embeddings := embedTexts(r.Context(), req.Texts)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(EmbedResponse{Embeddings: embeddings})
}

func rankHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RankRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Query == "" || len(req.Candidates) == 0 {
		http.Error(w, `{"error":"query and candidates required"}`, http.StatusBadRequest)
		return
	}

	topK := req.TopK
	if topK <= 0 {
		topK = 3
	}
	if topK > len(req.Candidates) {
		topK = len(req.Candidates)
	}

	// Embed query + all candidates in a single batched call.
	texts := make([]string, 1+len(req.Candidates))
	texts[0] = req.Query
	for i, c := range req.Candidates {
		texts[i+1] = c.Text
	}

	embeddings := embedTexts(r.Context(), texts)
	queryVec := embeddings[0]

	type scored struct {
		id    string
		score float64
	}
	items := make([]scored, len(req.Candidates))
	for i, c := range req.Candidates {
		items[i] = scored{id: c.ID, score: cosineSim(queryVec, embeddings[i+1])}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].score > items[j].score })

	ranked := make([]RankedItem, topK)
	for i := 0; i < topK; i++ {
		ranked[i] = RankedItem{ID: items[i].id, Score: items[i].score}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(RankResponse{Ranked: ranked})
}

// ─── Main ────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	port := os.Getenv("GO_EMBED_PORT")
	if port == "" {
		port = "8001"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/embed", embedHandler)
	mux.HandleFunc("/rank", rankHandler)

	slog.Info("go-embed: starting", "port", port, "embed_dim", embedDim)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		slog.Error("go-embed: server error", "err", err)
		os.Exit(1)
	}
}
