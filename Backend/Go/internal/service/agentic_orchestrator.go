package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
	Result         string         `json:"result"`
	TraceID        string         `json:"trace_id"`
	ReasoningSteps []any          `json:"reasoning_steps,omitempty"`
	State          map[string]any `json:"state,omitempty"`
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
		nodeURL: nodeURL,
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

func (a *AgenticOrchestrator) post(ctx context.Context, path string, payload any) (*AgenticResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.nodeURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call node orchestrator at %s: %w", path, err)
	}
	defer resp.Body.Close()

	var result AgenticResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode node response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("node orchestrator error %d on %s: %s", resp.StatusCode, path, result.Result)
	}
	return &result, nil
}
