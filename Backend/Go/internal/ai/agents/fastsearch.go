// Package agents holds the AI service's agent implementations. Direct port of
// Backend/Node/src/agents/*.js — same prompts, same models, same fallbacks.
package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"mypal/api/go/internal/ai/llm"
)

// ChatModel — the AI chat is a single model, Gemini 3.6 Flash, for every turn.
const ChatModel = "gemini-flash"

// SearchOutcome is what the chat and global-search features return.
type SearchOutcome struct {
	Text     string           `json:"text"`
	Products []llm.WebProduct `json:"products"`
}

// FastSearch is the app's single chat engine.
//
// Acts like a general-purpose search engine (not shopping-only):
//  1. Tavily web search → real-time results from the open web
//  2. Tavily links      → real source URLs passed to the UI
//  3. Gemini 3.6 Flash  → natural-language answer with cited sources
//
// If the user's query happens to be shopping-related the MyPal catalog results
// are injected as context so the model can recommend in-app products.
func FastSearch(
	ctx context.Context,
	p *llm.Provider,
	query string,
	internalProducts []map[string]any,
	history []llm.Message,
) SearchOutcome {
	// The two searches are independent; run them concurrently like the JS Promise.all.
	type linksResult struct{ products []llm.WebProduct }
	linksCh := make(chan linksResult, 1)
	go func() { linksCh <- linksResult{p.WebProductSearch(ctx, query, 6)} }()

	searchResults := p.TavilySearch(ctx, query, 5)
	webLinks := (<-linksCh).products

	// Prior conversation turns (role/content), capped, so follow-up questions
	// like "compare the first two" or "what about cheaper ones" keep context.
	priorTurns := trimHistory(history, 8, 4000)

	mypalSection := ""
	if len(internalProducts) > 0 {
		mypalSection = "\n\nPRODUCTS AVAILABLE ON MYPAL (if the query is shopping-related, recommend these first):\n" +
			marshalJSON(headMaps(internalProducts, 5))
	}

	prompt := fmt.Sprintf(`You are a helpful search assistant — like a web search engine — in an ongoing chat.
Answer the user's latest query accurately, helpfully, and concisely based on the web results below.
Use the earlier conversation for context: if the user refers to "it", "those", "the first one", or asks a
follow-up, resolve it against what was already discussed.

Rules:
- If it is a factual question, answer it directly and cite your sources with markdown links.
- If it is a shopping / product query, list the best options with prices and links.
- If it is a news query, summarise the key facts and link to sources.
- If it is a how-to or technical query, give clear step-by-step guidance.
- Always include at least 2–3 source links using [Title](URL) format.
- Do NOT make up facts not present in the results.

Latest query: %s

Web Results:
%s%s`, query, summariseSources(searchResults), mypalSection)

	// Send the prior turns as real chat messages followed by the grounded prompt,
	// so the model keeps conversational memory within the thread.
	messages := append(append([]llm.Message{}, priorTurns...), llm.Message{Role: "user", Content: prompt})
	text, _ := p.Chat(ctx, ChatModel, messages, llm.Options{})

	return SearchOutcome{Text: realText(text), Products: webLinks}
}

// mockMarkers strip the mock sentinel so the UI shows empty instead of placeholder text.
var mockMarkers = []string{"mock orchestration output", "mock orchestration"}

func realText(value string) string {
	t := strings.TrimSpace(value)
	if t == "" {
		return ""
	}
	lowered := strings.ToLower(t)
	for _, m := range mockMarkers {
		if strings.Contains(lowered, m) {
			return ""
		}
	}
	return t
}

func summariseSources(results []llm.SearchResult) string {
	parts := make([]string, 0, len(results))
	for i, r := range results {
		parts = append(parts, fmt.Sprintf("[%d] %s\nURL: %s\n%s", i+1, r.Title, r.URL, r.Content))
	}
	return strings.Join(parts, "\n\n")
}

func trimHistory(history []llm.Message, maxTurns, maxChars int) []llm.Message {
	kept := make([]llm.Message, 0, len(history))
	for _, m := range history {
		if m.Content == "" || (m.Role != "user" && m.Role != "assistant") {
			continue
		}
		content := m.Content
		if maxChars > 0 && len(content) > maxChars {
			content = content[:maxChars]
		}
		kept = append(kept, llm.Message{Role: m.Role, Content: content})
	}
	if len(kept) > maxTurns {
		kept = kept[len(kept)-maxTurns:]
	}
	return kept
}

func headMaps(items []map[string]any, n int) []map[string]any {
	if len(items) > n {
		return items[:n]
	}
	return items
}

func marshalJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "[]"
	}
	return string(b)
}
