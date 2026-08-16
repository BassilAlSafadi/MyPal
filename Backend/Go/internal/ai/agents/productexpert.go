package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"mypal/api/go/internal/ai/llm"
)

// ProductModel — all product-scoped AI tools (chat, summarize, translate) use
// the shared Gemini 3.6 Flash model ('gemini-flash').
const ProductModel = "gemini-flash"

// AskProductExpertInput mirrors the JS destructured argument object.
type AskProductExpertInput struct {
	Question    string         `json:"question"`
	ProductData map[string]any `json:"product_data"`
	Persona     string         `json:"persona"`
	History     []llm.Message  `json:"history"`
}

// AskProductExpert answers questions about one specific product from its metadata.
func AskProductExpert(ctx context.Context, p *llm.Provider, in AskProductExpertInput) string {
	persona := in.Persona
	if persona == "" {
		persona = "General shopper"
	}

	system := fmt.Sprintf(`ROLE:
You are the "MyPal Product Expert," a highly intelligent shopping assistant.
Your goal is to answer user questions about a SPECIFIC product using provided metadata.

USER PERSONA CONTEXT:
The user is currently identified with the following interests/persona: %s
Tailor your tone, vocabulary, and priorities to match this persona.
(e.g., if Fitness, focus on health benefits/durability; if Tech, focus on specs/integration).

PRODUCT DATA (TRUTH SOURCE):
%s

CONSTRAINTS:
1. Answer ONLY based on the provided product data. If information is missing, state it clearly.
2. Be surgical and concise. No fluff.
3. If the product is 'External' (scraped), mention that the data is live from the web.
4. If the user asks something dangerous or irrelevant to the product, politely redirect them.

FORMATTING:
Use clean Markdown. Use bullet points for technical specs.`, persona, metadataBlock(in.ProductData))

	// Prior turns of this product's chat window, so follow-up questions have memory.
	messages := []llm.Message{{Role: "system", Content: system}}
	messages = append(messages, trimHistory(in.History, 8, 0)...)
	messages = append(messages, llm.Message{Role: "user", Content: in.Question})

	text, _ := p.Chat(ctx, ProductModel, messages, llm.Options{})
	return text
}

// SummarizeProductDescription condenses a listing for a shopper.
func SummarizeProductDescription(ctx context.Context, p *llm.Provider, description string) string {
	text := strings.TrimSpace(description)
	if text == "" {
		return ""
	}

	prompt := fmt.Sprintf(`Summarize the following product description for a shopper in 2-3 concise sentences.
Keep the key selling points and specs. Do not invent information that isn't present.

Description:
%s`, text)

	out, _ := p.Chat(ctx, ProductModel, []llm.Message{{Role: "user", Content: prompt}}, llm.Options{})
	return out
}

// TranslateProductDescription renders a listing in another language.
func TranslateProductDescription(ctx context.Context, p *llm.Provider, description, targetLanguage string) string {
	text := strings.TrimSpace(description)
	if text == "" {
		return ""
	}
	if targetLanguage == "" {
		targetLanguage = "the user's language"
	}

	prompt := fmt.Sprintf(`You are a professional translator. Translate the following product description into %s.
Keep the tone natural, accurate, and suitable for a shopping app. Return only the translation.

Description:
%s`, targetLanguage, text)

	out, _ := p.Chat(ctx, ProductModel, []llm.Message{{Role: "user", Content: prompt}}, llm.Options{})
	return out
}

// metadataBlock renders product data as "- KEY: value" lines. Go maps have no
// stable order, so keys are sorted to keep the prompt deterministic.
func metadataBlock(data map[string]any) string {
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		var rendered string
		switch v := data[k].(type) {
		case string:
			rendered = v
		case nil:
			rendered = "null"
		case map[string]any, []any:
			b, _ := json.Marshal(v)
			rendered = string(b)
		default:
			rendered = fmt.Sprintf("%v", v)
		}
		lines = append(lines, fmt.Sprintf("- %s: %s", strings.ToUpper(k), rendered))
	}
	return strings.Join(lines, "\n")
}
