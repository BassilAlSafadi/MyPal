package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AgenticRequest is the input payload for agentic workflow invocations.
type AgenticRequest struct {
	Query        string `json:"query"`
	UserLocation string `json:"user_location"`
	Persona      string `json:"user_persona_bio"`
	Workflow     string `json:"workflow,omitempty"`
}

// AgenticResponse is the structured response returned by the Node.js orchestrator.
type AgenticResponse struct {
	Result         any              `json:"result"`
	Error          any              `json:"error,omitempty"`
	Products       []map[string]any `json:"products,omitempty"`
	TraceID        string           `json:"trace_id"`
	ReasoningSteps []any            `json:"reasoning_steps,omitempty"`
	State          map[string]any   `json:"state,omitempty"`
}

// AgenticOrchestrator performs Go-side validation and then delegates LLM execution
// to the Node.js orchestrator service. It owns the API contract — Node.js is an
// implementation detail behind it.
type AgenticOrchestrator struct {
	nodeURL    string
	httpClient *http.Client
}

// NewAgenticOrchestrator wires up the orchestrator to target the given Node.js base URL.
func NewAgenticOrchestrator(nodeURL string) *AgenticOrchestrator {
	return &AgenticOrchestrator{
		nodeURL: strings.TrimRight(strings.TrimSpace(nodeURL), "/"),
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// ValidateInput enforces Go-side input constraints before forwarding to Node.js.
func (a *AgenticOrchestrator) ValidateInput(req AgenticRequest) error {
	if req.Query == "" {
		return fmt.Errorf("query is required")
	}
	if len(req.Query) > 2000 {
		return fmt.Errorf("query exceeds 2000 character limit")
	}
	return nil
}

// DeepSearch invokes the full 14-node agentic search workflow.
func (a *AgenticOrchestrator) DeepSearch(ctx context.Context, req AgenticRequest) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/deep-search", req)
}

// FastSearch invokes the lightweight Tavily + LLM search feature.
func (a *AgenticOrchestrator) FastSearch(ctx context.Context, query string) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/fast-search", map[string]string{"query": query})
}

// Translate invokes the translation agent.
func (a *AgenticOrchestrator) Translate(ctx context.Context, targetLang, text string) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/translate", map[string]string{"target_language": targetLang, "text": text})
}

// Summarize invokes the Cohere summarization agent.
func (a *AgenticOrchestrator) Summarize(ctx context.Context, text, length string) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/summarize", map[string]string{"text": text, "length": length})
}

// Recommend invokes the ProdBERT + LLM recommendation pipeline.
func (a *AgenticOrchestrator) Recommend(ctx context.Context, persona string, catalog []map[string]any) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/recommend", map[string]any{"persona": persona, "catalog": catalog})
}

// ProductAsk invokes the persona-aware product Q&A agent.
func (a *AgenticOrchestrator) ProductAsk(ctx context.Context, question string, productData map[string]any, persona string) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/product/ask", map[string]any{
		"question":     question,
		"product_data": productData,
		"persona":      persona,
	})
}

// Clean invokes the scraped-data extraction agent (ScrapedDataCleaner).
func (a *AgenticOrchestrator) Clean(ctx context.Context, rawText string) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/scraped/clean", map[string]string{"raw_text": rawText})
}

// SellerAnalyze invokes the full map-reduce seller analytics pipeline.
func (a *AgenticOrchestrator) SellerAnalyze(ctx context.Context, products []map[string]any, sellerID string) (*AgenticResponse, error) {
	return a.post(ctx, "/ai/seller/analyze", map[string]any{
		"products":  products,
		"seller_id": sellerID,
	})
}

func (a *AgenticOrchestrator) post(ctx context.Context, path string, payload any) (*AgenticResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, joinURL(a.nodeURL, path), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call node orchestrator at %s: %w", path, err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read node response from %s: %w", path, err)
	}

	trimmedBody := bytes.TrimSpace(rawBody)
	if !json.Valid(trimmedBody) {
		return nil, fmt.Errorf("node orchestrator returned non-JSON response %d on %s: %s", resp.StatusCode, path, compactBody(rawBody))
	}

	var result AgenticResponse
	if err := json.Unmarshal(trimmedBody, &result); err != nil {
		return nil, fmt.Errorf("decode node response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("node orchestrator error %d on %s: %s", resp.StatusCode, path, errorMessage(result, rawBody))
	}
	return &result, nil
}

func joinURL(baseURL, path string) string {
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(path, "/")
}

func errorMessage(result AgenticResponse, rawBody []byte) string {
	for _, message := range []any{result.Result, result.Error} {
		messageText := stringifyMessage(message)
		if strings.TrimSpace(messageText) != "" {
			return messageText
		}
	}
	return compactBody(rawBody)
}

func stringifyMessage(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	default:
		raw, err := json.Marshal(typed)
		if err != nil {
			return fmt.Sprint(typed)
		}
		return string(raw)
	}
}

func compactBody(body []byte) string {
	compact := strings.Join(strings.Fields(string(body)), " ")
	if len(compact) > 300 {
		return compact[:300] + "..."
	}
	if compact == "" {
		return "<empty>"
	}
	return compact
}
