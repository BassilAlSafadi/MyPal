package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

// ModelConfig is one named model slot. The AI service runs on one real model:
//
//	gemini-flash → Gemini 3.6 Flash, every AI feature (chat, product copilot,
//	               recommendations, seller analytics, data cleaning, listing
//	               checks).
//	security     → Prompt-Guard-86M via HuggingFace, the entry-shield
//	               classifier. Not a chat model, left untouched.
type ModelConfig struct {
	Provider    string
	Model       string
	Temperature float64
	MaxTokens   int
}

const geminiFlash = "gemini-3.6-flash"

var Models = map[string]ModelConfig{
	"security": {Provider: "huggingface-classification", Model: "meta-llama/Prompt-Guard-86M"},

	// gemini-flash: the app's single everyday chat model.
	"gemini-flash": {Provider: "gemini-api", Model: geminiFlash, Temperature: 0.3, MaxTokens: 2048},
}

// Options tune a single chat call.
type Options struct {
	// ResponseFormat "json" asks the provider for a JSON object and makes the
	// caller's fallback a parsed mock rather than mock prose.
	ResponseFormat string
	Temperature    *float64
	MaxTokens      int
	Timeout        time.Duration
	Attempts       int
}

// SearchResult is one Tavily hit.
type SearchResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Content string `json:"content"`
}

// WebProduct is a web result mapped into the product shape the UI consumes.
type WebProduct struct {
	Name      string   `json:"name"`
	Price     float64  `json:"price"`
	Currency  string   `json:"currency"`
	Source    string   `json:"source"`
	SourceURL string   `json:"source_url"`
	Thumbnail *string  `json:"thumbnail"`
	KeySpecs  []string `json:"key_specs"`
	TotalCost float64  `json:"total_cost"`
}

// Classification is one Prompt-Guard label/score pair.
type Classification struct {
	Label string  `json:"label"`
	Score float64 `json:"score"`
}

// Provider is the LLM + search surface the agents call.
type Provider struct {
	env    func(string) string
	client *http.Client
}

// NewProvider reads configuration from the process environment.
func NewProvider() *Provider { return NewProviderWithEnv(os.Getenv) }

// NewProviderWithEnv allows tests to substitute the environment lookup.
func NewProviderWithEnv(env func(string) string) *Provider {
	return &Provider{
		env:    env,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// Chat calls the model behind modelKey and returns its text.
//
// It degrades to a mock response on any provider error (bad/expired key, rate
// limit, model not found, network) so a single failing node never crashes the
// whole agentic workflow with a 500.
func (p *Provider) Chat(ctx context.Context, modelKey string, messages []Message, opts Options) (string, error) {
	cfg, ok := Models[modelKey]
	if !ok {
		return "", fmt.Errorf("unknown model key: %s", modelKey)
	}

	normalized := NormalizeMessages(messages)
	mock := func() string { return mockResponse(modelKey, normalized, opts.ResponseFormat) }

	var apiKey, baseURL string
	if cfg.Provider == "gemini-api" {
		apiKey, baseURL = p.env("GEMINI_API_KEY"), "https://generativelanguage.googleapis.com/v1beta/openai"
	}

	if apiKey == "" || baseURL == "" {
		return mock(), nil
	}

	temperature := cfg.Temperature
	if opts.Temperature != nil {
		temperature = *opts.Temperature
	}
	maxTokens := opts.MaxTokens
	if maxTokens == 0 {
		maxTokens = cfg.MaxTokens
	}
	if maxTokens == 0 {
		maxTokens = 1024
	}

	payload := map[string]any{
		"model":       cfg.Model,
		"messages":    normalized,
		"temperature": temperature,
		"max_tokens":  maxTokens,
	}
	if opts.ResponseFormat == "json" {
		payload["response_format"] = map[string]string{"type": "json_object"}
	}

	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	raw, err := p.postJSON(ctx, strings.TrimRight(baseURL, "/")+"/chat/completions", payload,
		map[string]string{"Authorization": "Bearer " + apiKey}, timeout)
	if err != nil {
		return mock(), nil
	}

	return AsContent(raw), nil
}

// ChatJSON runs Chat with ResponseFormat=json and unmarshals into v.
// Returns false when the model produced nothing parseable, so the caller can
// fall back exactly where the JS did.
func (p *Provider) ChatJSON(ctx context.Context, modelKey string, messages []Message, opts Options, v any) bool {
	opts.ResponseFormat = "json"
	content, err := p.Chat(ctx, modelKey, messages, opts)
	if err != nil {
		return false
	}
	return SafeParseJSON(content, v)
}

// ChatWithFallback retries the primary model with exponential backoff, then
// falls back to the mock. Backoff mirrors the notebook:
// wait_exponential(multiplier=1, min=2, max=10).
func (p *Provider) ChatWithFallback(ctx context.Context, primary string, messages []Message, opts Options) string {
	attempts := opts.Attempts
	if attempts == 0 {
		attempts = 3
	}

	backoff := func(i int) time.Duration {
		ms := math.Min(10000, math.Max(2000, 1000*math.Pow(2, float64(i))))
		return time.Duration(ms) * time.Millisecond
	}

	for i := 0; i < attempts; i++ {
		content, err := p.Chat(ctx, primary, messages, opts)
		if err == nil {
			return content
		}
		if i < attempts-1 {
			select {
			case <-ctx.Done():
				return mockResponse(primary, messages, opts.ResponseFormat)
			case <-time.After(backoff(i)):
			}
		}
	}

	return mockResponse(primary, messages, opts.ResponseFormat)
}

// ClassifySecurity runs the Prompt-Guard entry shield, falling back to a local
// heuristic when no HuggingFace key is configured or the call fails.
func (p *Provider) ClassifySecurity(ctx context.Context, text string) []Classification {
	apiKey := p.env("HUGGING_FACE_API_KEY")
	if apiKey == "" {
		return heuristicSecurityClassification(text)
	}

	raw, err := p.postJSON(ctx,
		"https://api-inference.huggingface.co/models/"+Models["security"].Model,
		map[string]string{"inputs": text},
		map[string]string{"Authorization": "Bearer " + apiKey},
		15*time.Second)
	if err != nil {
		return heuristicSecurityClassification(text)
	}

	// The endpoint returns either [[{label,score}]] or [{label,score}].
	var nested [][]Classification
	if json.Unmarshal(raw, &nested) == nil {
		var flat []Classification
		for _, group := range nested {
			flat = append(flat, group...)
		}
		if len(flat) > 0 {
			return flat
		}
	}
	var flat []Classification
	if json.Unmarshal(raw, &flat) == nil && len(flat) > 0 {
		return flat
	}

	return heuristicSecurityClassification(text)
}

// TavilySearch runs a live web search.
func (p *Provider) TavilySearch(ctx context.Context, query string, maxResults int) []SearchResult {
	unavailable := func(reason string) []SearchResult {
		return []SearchResult{{Title: "Search unavailable", Content: reason}}
	}

	apiKey := p.env("TAVILY_API_KEY")
	if apiKey == "" {
		return unavailable("Live search is not configured for query: " + query)
	}

	raw, err := p.postJSON(ctx, "https://api.tavily.com/search", map[string]any{
		"api_key":      apiKey,
		"query":        query,
		"max_results":  maxResults,
		"search_depth": "advanced",
	}, nil, 20*time.Second)
	if err != nil {
		return unavailable("Live search is temporarily unavailable for query: " + query)
	}

	var body struct {
		Results []SearchResult `json:"results"`
	}
	if json.Unmarshal(raw, &body) != nil {
		return nil
	}
	return body.Results
}

// WebProductSearch finds real retailer pages for a query.
//
// Kept under this name because it is the same call the JS exported as
// duckDuckGoSearch: DDG blocks automated requests, so it has always run on
// Tavily. Results give the LLM real URLs (Amazon, Best Buy, B&H, etc.) to cite.
func (p *Provider) WebProductSearch(ctx context.Context, query string, maxResults int) []WebProduct {
	if query == "" {
		return nil
	}

	results := p.TavilySearch(ctx, query, maxResults)
	products := make([]WebProduct, 0, len(results))

	for _, r := range results {
		if r.URL == "" || r.Title == "" {
			continue
		}
		if len(products) >= maxResults {
			break
		}

		var specs []string
		if r.Content != "" {
			specs = []string{r.Content}
		}

		products = append(products, WebProduct{
			Name:      r.Title,
			Price:     0, // price extracted later by the calculate node
			Currency:  "USD",
			Source:    Hostname(r.URL),
			SourceURL: r.URL,
			// Pass the snippet as a spec so the LLM can attempt price extraction
			KeySpecs:  specs,
			TotalCost: 0,
		})
	}

	return products
}

// Hostname strips the scheme and leading www. from a URL.
func Hostname(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" {
		return "External source"
	}
	return strings.TrimPrefix(u.Hostname(), "www.")
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

func (p *Provider) postJSON(ctx context.Context, endpoint string, payload any, headers map[string]string, timeout time.Duration) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(raw))
	}
	return raw, nil
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

var jailbreakRe = regexp.MustCompile(`(?i)(ignore previous|system prompt|jailbreak|database password|drop table|union select)`)

func heuristicSecurityClassification(text string) []Classification {
	if jailbreakRe.MatchString(text) {
		return []Classification{{Label: "JAILBREAK", Score: 0.95}}
	}
	return []Classification{{Label: "SAFE", Score: 0.99}}
}

// mockResponse is the deterministic stand-in used whenever a provider is
// unconfigured or failing.
func mockResponse(modelKey string, messages []Message, responseFormat string) string {
	return "Mock orchestration output"
}
