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

// ProductAskHandler handles POST /api/v1/ai/agentic/product-ask.
func ProductAskHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var body struct {
			Question    string         `json:"question"`
			ProductData map[string]any `json:"product_data"`
			Persona     string         `json:"persona"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Question == "" {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "question is required", traceID)
			return
		}

		result, err := svc.ProductAsk(r.Context(), body.Question, body.ProductData, body.Persona)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}

// CleanHandler handles POST /api/v1/ai/agentic/clean.
func CleanHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var body struct {
			RawText string `json:"raw_text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RawText == "" {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "raw_text is required", traceID)
			return
		}

		result, err := svc.Clean(r.Context(), body.RawText)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}

// SellerAnalyzeHandler handles POST /api/v1/ai/agentic/seller-analyze.
func SellerAnalyzeHandler(svc *service.AgenticOrchestrator) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		var body struct {
			Products []map[string]any `json:"products"`
			SellerID string           `json:"seller_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "request body must be valid JSON", traceID)
			return
		}
		if len(body.Products) == 0 {
			responses.Error(w, http.StatusBadRequest, "INVALID_BODY", "products array is required and must not be empty", traceID)
			return
		}

		result, err := svc.SellerAnalyze(r.Context(), body.Products, body.SellerID)
		if err != nil {
			responses.Error(w, http.StatusBadGateway, "AGENTIC_ERROR", err.Error(), traceID)
			return
		}

		responses.OK(w, result)
	})
}
