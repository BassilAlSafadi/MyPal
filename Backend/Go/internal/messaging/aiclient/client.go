// Package aiclient lets the messaging service ask the AI service to answer a
// chat turn.
//
// In the Node orchestrator, storing the thread and generating the reply were the
// same handler. The split separates them: messaging owns the conversation, the
// AI service owns the model call. This is the seam between them.
package aiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Message is one chat turn sent as conversation history.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Answer is the AI service's reply to a chat turn.
type Answer struct {
	Result   string `json:"result"`
	Products []any  `json:"products"`
}

// Client calls the AI service.
type Client struct {
	baseURL       string
	internalToken string
	http          *http.Client
}

func New(baseURL, internalToken string) *Client {
	return &Client{
		baseURL:       baseURL,
		internalToken: internalToken,
		// The agentic pipeline chains several model calls, so this waits well
		// past a normal service-to-service budget.
		http: &http.Client{Timeout: 3 * time.Minute},
	}
}

// FastSearch asks the AI service for the assistant's reply to one chat turn.
// bearerToken is the caller's own access token, relayed so the AI service
// attributes the search and its quota to the right user.
func (c *Client) FastSearch(
	ctx context.Context,
	bearerToken, query string,
	internalProducts []map[string]any,
	history []Message,
) (*Answer, error) {
	body, err := json.Marshal(map[string]any{
		"query":             query,
		"internal_products": internalProducts,
		"history":           history,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/api/v1/ai/agentic/fast-search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	if c.internalToken != "" {
		req.Header.Set("X-Internal-Token", c.internalToken)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ai service returned HTTP %d", resp.StatusCode)
	}

	var answer Answer
	if err := json.NewDecoder(resp.Body).Decode(&answer); err != nil {
		return nil, err
	}
	return &answer, nil
}
