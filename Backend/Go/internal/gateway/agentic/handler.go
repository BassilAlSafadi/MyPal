// Package agentic provides Go-native HTTP handlers for agentic AI endpoints.
// Each handler validates the request on the Go side, then delegates LLM execution
// to the Node.js orchestrator via AgenticOrchestrator.
package agentic

import (
	"encoding/json"
	"net/http"

	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/tracing"
	"mypal/api/go/internal/service"
)

// DeepSearchHandler handles POST /api/v1/ai/agentic/deep-search.
func DeepSearchHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var req service.AgenticRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON", traceID)
			return
		}

		if err := svc.ValidateInput(req); err != nil {
			responses.Error(w, http.StatusUnprocessableEntity, "VALIDATION_FAILED", err.Error(), traceID)
			return
		}

		result, err := svc.DeepSearch(r.Context(), req)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}

// FastSearchHandler handles POST /api/v1/ai/agentic/fast-search.
func FastSearchHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var body struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Query == "" {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "query is required", traceID)
			return
		}

		result, err := svc.FastSearch(r.Context(), body.Query)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}

// TranslateHandler handles POST /api/v1/ai/agentic/translate.
func TranslateHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var body struct {
			TargetLanguage string `json:"target_language"`
			Text           string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TargetLanguage == "" || body.Text == "" {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "target_language and text are required", traceID)
			return
		}

		result, err := svc.Translate(r.Context(), body.TargetLanguage, body.Text)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}

// SummarizeHandler handles POST /api/v1/ai/agentic/summarize.
func SummarizeHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var body struct {
			Text   string `json:"text"`
			Length string `json:"length"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Text == "" {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "text is required", traceID)
			return
		}
		if body.Length == "" {
			body.Length = "medium"
		}

		result, err := svc.Summarize(r.Context(), body.Text, body.Length)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}

// RecommendHandler handles POST /api/v1/ai/agentic/recommend.
func RecommendHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var body struct {
			Persona string           `json:"persona"`
			Catalog []map[string]any `json:"catalog"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON", traceID)
			return
		}
		if body.Persona == "" || len(body.Catalog) == 0 {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "persona and catalog are required", traceID)
			return
		}

		result, err := svc.Recommend(r.Context(), body.Persona, body.Catalog)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}
