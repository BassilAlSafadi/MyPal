package agents

import (
	"context"
	"encoding/json"
	"fmt"

	"mypal/api/go/internal/ai/llm"
)

// SellerProductInput is one product with its reviews.
type SellerProductInput struct {
	ProductName string   `json:"product_name"`
	Reviews     []string `json:"reviews"`
}

// SellerAnalytics implements the map-reduce seller evaluation pipeline from the notebook.
//
//	Map phase:    each product's reviews → structured sentiment profile.
//	Reduce phase: all profiles → unified Seller Identity Report.
type SellerAnalytics struct {
	provider *llm.Provider
}

func NewSellerAnalytics(p *llm.Provider) *SellerAnalytics { return &SellerAnalytics{provider: p} }

// MapProductSummaries turns each product's reviews into a structured profile.
func (s *SellerAnalytics) MapProductSummaries(ctx context.Context, products []SellerProductInput) []map[string]any {
	profiles := make([]map[string]any, 0, len(products))

	for _, item := range products {
		reviews, _ := json.Marshal(item.Reviews)
		prompt := fmt.Sprintf(`Analyze reviews for "%s".
Reviews: %s

Return a JSON object with:
- 'sentiment_score': (1-10)
- 'key_praise': (top strength)
- 'key_complaint': (top weakness)
- 'grandma_score': (how easy/safe is this for non-tech seniors, 1-10)`, item.ProductName, string(reviews))

		var response map[string]any
		if !s.provider.ChatJSON(ctx, "gemini-flash", []llm.Message{{Role: "user", Content: prompt}}, llm.Options{}, &response) || response == nil {
			response = map[string]any{}
		}
		response["product_name"] = item.ProductName
		profiles = append(profiles, response)
	}

	return profiles
}

// ReduceToSellerIdentity narrates the Seller Identity Report from the profiles.
func (s *SellerAnalytics) ReduceToSellerIdentity(ctx context.Context, profiles []map[string]any) string {
	pretty, _ := json.MarshalIndent(profiles, "", "  ")

	prompt := fmt.Sprintf(`ACT AS A SENIOR BUSINESS AUDITOR.
Analyze these product profiles for a single seller:
%s

Task: Generate a 'Seller Identity Report' that reflects their attitude toward customers.
Focus on:
1. Operational Patterns (Are they consistent?)
2. Customer Centricity (Do they care about quality or just volume?)
3. Systematic Risks (Is there a recurring failure in their supply chain?)
4. The 'Grandma' Verdict (Is this seller reliable for non-tech users?)`, string(pretty))

	out, _ := s.provider.Chat(ctx, "gemini-flash", []llm.Message{{Role: "user", Content: prompt}}, llm.Options{})
	return out
}
