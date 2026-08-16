package agents

import (
	"context"
	"fmt"

	"mypal/api/go/internal/ai/llm"
)

// CleanScrapedContent extracts structured product fields from raw scraped page text.
func CleanScrapedContent(ctx context.Context, p *llm.Provider, rawText string) map[string]any {
	if len(rawText) > 4000 {
		rawText = rawText[:4000]
	}

	prompt := fmt.Sprintf(`You are a Data Extraction Agent. I will give you raw text scraped from a product page.
Your task is to extract the following fields and return ONLY a valid JSON object:

Fields:
- title (Product Name)
- price (Numeric value only)
- currency (e.g., EGP, USD)
- specs (Main technical details)
- category (Best fit for the item)
- description (A 1-sentence summary for BERT)

RAW TEXT:
%s

RETURN ONLY JSON:`, rawText)

	zero := 0.0
	var out map[string]any
	if p.ChatJSON(ctx, "gemini-flash", []llm.Message{{Role: "user", Content: prompt}},
		llm.Options{Temperature: &zero}, &out) && out != nil {
		return out
	}
	return map[string]any{}
}
