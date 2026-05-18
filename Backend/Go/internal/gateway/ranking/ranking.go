// Package ranking implements the architecture-approved hybrid ranking formula:
//
//	final_score = 0.60 × vector_cosine_score
//	            + 0.25 × bm25_keyword_score
//	            + 0.10 × seller_trust_score    (normalised to [0,1])
//	            + 0.05 × recency_boost          (normalised to [0,1])
//
// Each scorer is isolated and independently testable.
// The explainability breakdown is included in every result.
package ranking

import (
	"math"
	"strings"
	"time"
)

// Weights defines the contribution of each signal to the final score.
// Values must sum to 1.0.
var Weights = struct {
	Vector float64
	BM25   float64
	Trust  float64
	Recency float64
}{
	Vector:  0.60,
	BM25:    0.25,
	Trust:   0.10,
	Recency: 0.05,
}

// RawProduct contains the data needed by the ranker.
// Populated from the pgvector query result.
type RawProduct struct {
	ID           string
	Name         string
	Description  string
	Category     string
	Price        float64
	ImageURL     string
	VectorScore  float64 // cosine similarity from pgvector
	SellerRating float64 // 0–5 scale
	ReviewCount  int
	CreatedAt    time.Time
}

// RankedResult is the final normalised output per product.
type RankedResult struct {
	ID       string  `json:"id"`
	Name     string  `json:"title"` // mapped to 'title' for frontend compatibility
	Category string  `json:"category,omitempty"`
	Price    float64 `json:"price"`
	ImageURL string  `json:"image_url,omitempty"`
	Score    float64 `json:"score"`

	Explanation Explanation `json:"explanation"`
}

// Explanation provides per-signal score breakdown for observability and UX.
type Explanation struct {
	VectorScore  float64 `json:"vector_score"`
	BM25Score    float64 `json:"bm25_score"`
	TrustScore   float64 `json:"trust_score"`
	RecencyScore float64 `json:"recency_score"`
	Mode         string  `json:"mode"` // "hybrid" | "vector_only" | "degraded"
}

// Rank applies the hybrid formula to a set of raw pgvector results and
// returns them ordered by descending final_score.
func Rank(query string, products []RawProduct) []RankedResult {
	results := make([]RankedResult, 0, len(products))
	queryTokens := tokenize(query)

	for _, p := range products {
		vectorScore := clamp(p.VectorScore, 0, 1)
		bm25 := bm25Score(queryTokens, p.Name+" "+p.Description)
		trust := normaliseTrust(p.SellerRating, p.ReviewCount)
		recency := recencyBoost(p.CreatedAt)

		final := Weights.Vector*vectorScore +
			Weights.BM25*bm25 +
			Weights.Trust*trust +
			Weights.Recency*recency

		results = append(results, RankedResult{
			ID:       p.ID,
			Name:     p.Name,
			Category: p.Category,
			Price:    p.Price,
			ImageURL: p.ImageURL,
			Score:    round4(final),
			Explanation: Explanation{
				VectorScore:  round4(vectorScore),
				BM25Score:    round4(bm25),
				TrustScore:   round4(trust),
				RecencyScore: round4(recency),
				Mode:         "hybrid",
			},
		})
	}

	// Sort descending by Score (simple insertion sort for small N ≤ 50).
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && results[j].Score > results[j-1].Score; j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}
	return results
}

// ─── Scorers ───────────────────────────────────────────────────────────────

// bm25Score computes a simplified BM25-inspired term frequency score
// normalised to [0, 1]. For a true BM25 IDF we would need corpus statistics;
// here we use a TF approximation suitable for client-side ranking of ≤50 docs.
func bm25Score(queryTokens []string, document string) float64 {
	docTokens := tokenize(document)
	if len(docTokens) == 0 || len(queryTokens) == 0 {
		return 0
	}

	docFreq := make(map[string]int, len(docTokens))
	for _, t := range docTokens {
		docFreq[t]++
	}

	const k1, b = 1.5, 0.75
	avgDocLen := 50.0 // approximate average product description length in tokens
	docLen := float64(len(docTokens))

	var score float64
	for _, qt := range queryTokens {
		tf := float64(docFreq[qt])
		tfNorm := tf * (k1 + 1) / (tf + k1*(1-b+b*docLen/avgDocLen))
		score += tfNorm
	}

	// Normalise: cap at the number of query tokens, then scale to [0,1].
	maxScore := float64(len(queryTokens)) * (k1 + 1)
	if maxScore == 0 {
		return 0
	}
	return clamp(score/maxScore, 0, 1)
}

// normaliseTrust converts a seller rating (0–5) and review count into [0,1].
// Review count dampens the trust of sellers with very few reviews.
func normaliseTrust(rating float64, reviewCount int) float64 {
	if rating <= 0 {
		return 0
	}
	base := rating / 5.0
	// Dampen trust for sellers with fewer than 10 reviews.
	confidence := math.Min(1.0, float64(reviewCount)/10.0)
	return clamp(base*confidence, 0, 1)
}

// recencyBoost returns a score in [0,1] where products created within the
// last 30 days score near 1.0 and decay logarithmically over 365 days.
func recencyBoost(createdAt time.Time) float64 {
	ageHours := time.Since(createdAt).Hours()
	if ageHours <= 0 {
		return 1.0
	}
	// Logarithmic decay: score = 1 - log(1 + age_days) / log(1 + 365)
	ageDays := ageHours / 24
	score := 1.0 - math.Log1p(ageDays)/math.Log1p(365)
	return clamp(score, 0, 1)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

func tokenize(s string) []string {
	words := strings.Fields(strings.ToLower(s))
	tokens := make([]string, 0, len(words))
	for _, w := range words {
		// Strip non-alphanumeric characters from word boundaries.
		w = strings.Trim(w, ".,!?;:\"'()-")
		if len(w) > 1 {
			tokens = append(tokens, w)
		}
	}
	return tokens
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
}
