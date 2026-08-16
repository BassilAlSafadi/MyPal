// Package llm holds the model routing, provider fan-out and response parsing for
// the AI service. Direct port of Backend/Node/src/providers/llmProvider.js and
// Backend/Node/src/utils/helpers.js.
package llm

import (
	"encoding/json"
	"regexp"
	"strings"
)

var (
	thinkTagRe  = regexp.MustCompile(`(?s)<think>.*?</think>`)
	jsonFenceRe = regexp.MustCompile("```(?:json)?[ \t]*")
	fenceRe     = regexp.MustCompile("```")
	jsonBlobRe  = regexp.MustCompile(`(?s)\{.*\}|\[.*\]`)
)

// StripReasoningAndFences removes <think> blocks and markdown code fences that
// reasoning models wrap their output in.
func StripReasoningAndFences(text string) string {
	out := thinkTagRe.ReplaceAllString(text, "")
	out = jsonFenceRe.ReplaceAllString(out, "")
	out = fenceRe.ReplaceAllString(out, "")
	return strings.TrimSpace(out)
}

// SafeParseJSON parses text into v, first stripping fences and then, if that
// fails, retrying on the first {...} or [...] blob it can find. Reports whether
// a parse succeeded; callers substitute their own mock/fallback when it did not.
func SafeParseJSON(text string, v any) bool {
	cleaned := StripReasoningAndFences(text)
	if cleaned == "" {
		return false
	}
	if err := json.Unmarshal([]byte(cleaned), v); err == nil {
		return true
	}
	match := jsonBlobRe.FindString(cleaned)
	if match == "" {
		return false
	}
	return json.Unmarshal([]byte(match), v) == nil
}

// SafeParseJSONMap is the map-shaped convenience form of SafeParseJSON.
func SafeParseJSONMap(text string) map[string]any {
	var out map[string]any
	if SafeParseJSON(text, &out) && out != nil {
		return out
	}
	return map[string]any{}
}

// Message is one chat turn.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// NormalizeMessages defaults an empty role to "user", mirroring the JS helper
// that also accepted bare strings.
func NormalizeMessages(messages []Message) []Message {
	out := make([]Message, 0, len(messages))
	for _, m := range messages {
		role := m.Role
		if role == "" {
			role = "user"
		}
		out = append(out, Message{Role: role, Content: m.Content})
	}
	return out
}

// chatCompletionResponse covers the OpenAI-compatible shapes every configured
// provider returns, plus the Cohere-style generations form.
type chatCompletionResponse struct {
	Content string `json:"content"`
	Text    string `json:"text"`
	Choices []struct {
		Message struct {
			// Providers return either a plain string or an array of content parts,
			// so this stays as raw JSON and is unpacked in AsContent.
			Content json.RawMessage `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Generations []struct {
		Text string `json:"text"`
	} `json:"generations"`
}

// AsContent extracts the assistant text from a provider response body.
func AsContent(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}

	var resp chatCompletionResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		// Not JSON at all — the provider returned plain text.
		return string(raw)
	}

	if resp.Content != "" {
		return resp.Content
	}

	if len(resp.Choices) > 0 {
		content := resp.Choices[0].Message.Content
		if len(content) > 0 {
			var asString string
			if json.Unmarshal(content, &asString) == nil {
				return asString
			}

			var parts []struct {
				Text    string `json:"text"`
				Content string `json:"content"`
			}
			if json.Unmarshal(content, &parts) == nil {
				var collected []string
				for _, p := range parts {
					if p.Text != "" {
						collected = append(collected, p.Text)
					} else if p.Content != "" {
						collected = append(collected, p.Content)
					}
				}
				return strings.Join(collected, "\n")
			}
		}
		return ""
	}

	if len(resp.Generations) > 0 && resp.Generations[0].Text != "" {
		return resp.Generations[0].Text
	}
	if resp.Text != "" {
		return resp.Text
	}

	return string(raw)
}
