// Package httpapi exposes the AI service's REST surface.
// Direct port of Backend/Node/src/routes/agenticRoutes.js.
//
// Two things moved during the port:
//   - paths are the public /api/v1/ai/... ones the SPA already calls. The gateway
//     that rewrote /api/v1/ai/* onto this service's short paths is gone;
//   - chat threads are no longer served here. Persistent conversations are the
//     messaging service's, on its own MongoDB.
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"mypal/api/go/internal/ai/agents"
	"mypal/api/go/internal/ai/clients"
	"mypal/api/go/internal/ai/llm"
	"mypal/api/go/internal/ai/store"
	"mypal/api/go/internal/servicekit"
)

var uuidRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

// Deps are the collaborators the routes need.
type Deps struct {
	Provider  *llm.Provider
	Store     *store.Store
	Upstreams *clients.Clients
	JWTSecret string
}

// Register wires every route and returns the root handler.
func Register(mux *http.ServeMux, deps Deps) http.Handler {
	// Public: health and the service card.
	base := servicekit.Chain(
		servicekit.CorrelationID,
		servicekit.StructuredLogging,
		servicekit.PanicRecovery,
	)

	// Everything else needs a valid access token — the check the gateway used to run.
	authed := servicekit.Chain(
		servicekit.CorrelationID,
		servicekit.StructuredLogging,
		servicekit.PanicRecovery,
		servicekit.JWTValidation(deps.JWTSecret),
	)

	mux.Handle("GET /", base(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			servicekit.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "no route matched " + r.URL.Path})
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{
			"service": "MyPal AI service",
			"version": "2.0.0",
			"status":  "ok",
			"storage": "mongodb",
			"endpoints": []string{
				"POST /api/v1/ai/fast-search",
				"POST /api/v1/ai/product/ask",
				"POST /api/v1/ai/product/summarize",
				"POST /api/v1/ai/product/translate",
				"POST /api/v1/ai/scraped/clean",
				"GET  /api/v1/ai/recommend/me",
				"POST /api/v1/ai/summaries/map",
				"POST /api/v1/ai/summaries/reduce",
				"POST /api/v1/seller/listing/analyze",
				"POST /api/v1/seller/report/generate",
				"GET  /api/v1/seller-report/{sellerId}",
				"GET  /api/v1/ai/history/{feature}",
				"GET  /health",
			},
		})
	})))

	mux.Handle("GET /health", base(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		servicekit.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "ai"})
	})))

	// The canonical paths — what the SPA calls.
	mux.Handle("POST /api/v1/ai/fast-search", authed(fastSearchHandler(deps)))
	mux.Handle("POST /api/v1/ai/product/ask", authed(productAskHandler(deps)))
	mux.Handle("POST /api/v1/ai/product/summarize", authed(summarizeHandler(deps)))
	mux.Handle("POST /api/v1/ai/product/translate", authed(translateHandler(deps)))
	mux.Handle("POST /api/v1/ai/scraped/clean", authed(cleanHandler(deps)))
	mux.Handle("GET /api/v1/ai/recommend/me", authed(recommendHandler(deps)))

	// The /agentic/ spellings the gateway also published. Both surfaces were live
	// before the split — the gateway rewrote each onto the same Node handler — so
	// both are kept here rather than silently dropping one.
	mux.Handle("POST /api/v1/ai/agentic/fast-search", authed(fastSearchHandler(deps)))
	mux.Handle("POST /api/v1/ai/agentic/product-ask", authed(productAskHandler(deps)))
	mux.Handle("POST /api/v1/ai/agentic/clean", authed(cleanHandler(deps)))

	mux.Handle("POST /api/v1/ai/summaries/map", authed(summariesMapHandler(deps)))
	mux.Handle("POST /api/v1/ai/summaries/reduce", authed(summariesReduceHandler(deps)))

	mux.Handle("POST /api/v1/seller/listing/analyze", authed(listingAnalyzeHandler(deps)))
	mux.Handle("POST /api/v1/seller/report/generate", authed(reportGenerateHandler()))
	mux.Handle("GET /api/v1/seller-report/{sellerId}", authed(sellerReportHandler(deps)))

	mux.Handle("GET /api/v1/ai/history/{feature}", authed(historyHandler(deps)))

	return servicekit.CORS(servicekit.AllowedOrigins())(mux)
}

// ─── Search ───────────────────────────────────────────────────────────────────

type searchRequest struct {
	Query            string           `json:"query"`
	InternalProducts []map[string]any `json:"internal_products"`
	History          []llm.Message    `json:"history"`
}

func fastSearchHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		userID := callerID(r)

		var body searchRequest
		if err := servicekit.DecodeJSON(r, &body); err != nil {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request body", "trace_id": traceID})
			return
		}

		// Log search for recommendation personalization (fire-and-forget).
		if body.Query != "" {
			go deps.Store.LogSearch(context.WithoutCancel(r.Context()), userID, body.Query)
		}

		outcome := agents.FastSearch(r.Context(), deps.Provider, body.Query, body.InternalProducts, body.History)
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{
			"result": outcome.Text, "products": outcome.Products, "trace_id": traceID,
		})
	}
}

// ─── Product tools ────────────────────────────────────────────────────────────

func productAskHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		userID := callerID(r)

		var body agents.AskProductExpertInput
		if err := servicekit.DecodeJSON(r, &body); err != nil {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request body", "trace_id": traceID})
			return
		}

		result := agents.AskProductExpert(r.Context(), deps.Provider, body)
		if userID != "" && result != "" {
			go deps.Store.SaveFeatureHistory(context.WithoutCancel(r.Context()), userID, "ask-product",
				map[string]any{"question": body.Question, "product_data": body.ProductData, "persona": body.Persona}, result)
		}

		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"result": result, "trace_id": traceID})
	}
}

func summarizeHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		var body struct {
			Description string `json:"description"`
		}
		_ = servicekit.DecodeJSON(r, &body)

		result := agents.SummarizeProductDescription(r.Context(), deps.Provider, body.Description)
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"result": result, "trace_id": traceID})
	}
}

func translateHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		var body struct {
			Description    string `json:"description"`
			TargetLanguage string `json:"target_language"`
		}
		_ = servicekit.DecodeJSON(r, &body)

		result := agents.TranslateProductDescription(r.Context(), deps.Provider, body.Description, body.TargetLanguage)
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"result": result, "trace_id": traceID})
	}
}

func cleanHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		var body struct {
			RawText string `json:"raw_text"`
		}
		_ = servicekit.DecodeJSON(r, &body)

		result := agents.CleanScrapedContent(r.Context(), deps.Provider, body.RawText)
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"result": result, "trace_id": traceID})
	}
}

// ─── Recommendations ──────────────────────────────────────────────────────────

// recommendHandler serves personalized recommendations built from the caller's
// real activity: search history (what they look for), wishlist (what they intend
// to buy) and order history (what they've already bought).
//
// New users (no activity yet) get a default "general shopper" persona so the home
// screen always shows something useful instead of nothing.
func recommendHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		userID := callerID(r)

		// 1. Fetch the active catalog from the listings service.
		catalog := deps.Upstreams.Catalog(r.Context(), 60)
		if len(catalog) == 0 {
			servicekit.WriteJSON(w, http.StatusOK, map[string]any{
				"products": []any{}, "persona": "default", "trace_id": traceID,
			})
			return
		}

		// 2. Build a persona from the user's real activity.
		activityPersona := buildUserPersona(r.Context(), deps, userID)
		isPersonalized := activityPersona != ""
		persona := activityPersona
		if persona == "" {
			persona = "General shopper looking for quality products at good value across all categories"
		}

		// 3. ProdBERT embedding + LLM re-ranking.
		raw := agents.NewProdRecommender(deps.Provider).Recommend(r.Context(), persona, catalog)

		// 4. Map the returned IDs back to full product records.
		var topIDs []string
		var parsed []any
		if llm.SafeParseJSON(raw, &parsed) {
			for _, v := range parsed {
				switch id := v.(type) {
				case string:
					topIDs = append(topIDs, id)
				case float64:
					topIDs = append(topIDs, strconv.FormatFloat(id, 'f', -1, 64))
				}
			}
		}

		byID := make(map[string]agents.CatalogProduct, len(catalog))
		for _, p := range catalog {
			byID[p.ID] = p
		}

		products := make([]agents.CatalogProduct, 0, 3)
		for _, id := range topIDs {
			if p, ok := byID[id]; ok {
				products = append(products, p)
				if len(products) == 3 {
					break
				}
			}
		}
		if len(products) == 0 {
			// Graceful fallback: newest 3 products.
			limit := min(3, len(catalog))
			products = append(products, catalog[:limit]...)
		}

		personaLabel := "default"
		if isPersonalized {
			personaLabel = "personalized"
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{
			"products": products, "persona": personaLabel, "trace_id": traceID,
		})
	}
}

// buildUserPersona composes a natural-language persona from the user's real
// activity: last 15 searches, wishlist names/categories, and recent purchases.
// Returns "" when there is no recorded activity, so callers fall back to a default.
func buildUserPersona(ctx context.Context, deps Deps, userID string) string {
	if userID == "" {
		return ""
	}

	searches := deps.Store.RecentSearches(ctx, userID, 15)
	wishlist := deps.Upstreams.WishlistFor(ctx, userID)
	purchases := deps.Upstreams.PurchasesFor(ctx, userID)

	var parts []string
	if len(searches) > 0 {
		parts = append(parts, "Recently searched for: "+strings.Join(searches, ", "))
	}
	if len(wishlist) > 0 {
		names := make([]string, 0, 6)
		seenCategories := map[string]bool{}
		var categories []string
		for _, item := range wishlist {
			if len(names) < 6 {
				names = append(names, item.Name)
			}
			if item.Category != "" && !seenCategories[item.Category] {
				seenCategories[item.Category] = true
				categories = append(categories, item.Category)
			}
		}
		line := "Saved to wishlist: " + strings.Join(names, ", ")
		if len(categories) > 0 {
			line += " (" + strings.Join(categories, ", ") + ")"
		}
		parts = append(parts, line)
	}
	if len(purchases) > 0 {
		bought := make([]string, 0, len(purchases))
		for _, item := range purchases {
			entry := item.Name
			if item.Category != "" {
				entry += " (" + item.Category + ")"
			}
			bought = append(bought, entry)
		}
		parts = append(parts, "Previously purchased: "+strings.Join(bought, ", "))
	}

	return strings.Join(parts, ". ")
}

// ─── Seller report (map-reduce over reviews) ───────────────────────────────────

func summariesMapHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Products []agents.SellerProductInput `json:"products"`
		}
		if err := servicekit.DecodeJSON(r, &body); err != nil || body.Products == nil {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "products array required"})
			return
		}

		profiles := agents.NewSellerAnalytics(deps.Provider).MapProductSummaries(r.Context(), body.Products)
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"summaries": profiles})
	}
}

func summariesReduceHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Profiles []map[string]any `json:"profiles"`
			SellerID string           `json:"sellerId"`
		}
		if err := servicekit.DecodeJSON(r, &body); err != nil || body.Profiles == nil {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "profiles array required"})
			return
		}

		out := agents.NewSellerAnalytics(deps.Provider).ReduceToSellerIdentity(r.Context(), body.Profiles)

		var parsed map[string]any
		if !llm.SafeParseJSON(out, &parsed) {
			parsed = nil
		}

		// seller_performance_summaries is a listings-owned table, so persistence
		// goes through that service rather than a local Postgres write.
		var stored map[string]any
		if body.SellerID != "" {
			summary := out
			if parsed != nil {
				if v, ok := parsed["aiGeneratedSummary"].(string); ok && v != "" {
					summary = v
				}
			}
			payload := map[string]any{
				"seller_id":            body.SellerID,
				"ai_generated_summary": summary,
			}
			if parsed != nil {
				payload["top_complaint_themes"] = parsed["topComplaintThemes"]
				payload["sentiment_score"] = parsed["sentimentScore"]
				payload["grandma_score"] = parsed["grandmaScore"]
			}
			if result, err := deps.Upstreams.SaveSellerReport(r.Context(), payload); err == nil {
				stored = result
			}
		}

		servicekit.WriteJSON(w, http.StatusOK, map[string]any{
			"seller_report": out, "parsed": parsed, "stored": stored,
		})
	}
}

func listingAnalyzeHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())

		var body struct {
			Title       string  `json:"title"`
			Description string  `json:"description"`
			Category    string  `json:"category"`
			Price       float64 `json:"price"`
			ListingID   string  `json:"listing_id"`
		}
		_ = servicekit.DecodeJSON(r, &body)

		prompt := "Analyze this product listing for completeness, policy violations, and SEO:\n" +
			"Title: " + body.Title + "\n" +
			"Desc: " + body.Description + "\n" +
			"Category: " + body.Category + "\n" +
			"Price: " + strconv.FormatFloat(body.Price, 'f', -1, 64) + "\n" +
			`Return a JSON with "is_valid" (boolean), "confidence_score" (0-1), "suggestions" (array), "flags" (array).`

		out := map[string]any{"is_valid": true, "confidence_score": 0.5, "suggestions": []any{}, "flags": []any{}}
		var parsed map[string]any
		if deps.Provider.ChatJSON(r.Context(), "gemini-flash", []llm.Message{{Role: "user", Content: prompt}}, llm.Options{}, &parsed) && len(parsed) > 0 {
			out = parsed
		}

		entityID := body.ListingID
		if entityID == "" {
			entityID = "new"
		}
		isValid, _ := out["is_valid"].(bool)
		notes, _ := json.Marshal(out)
		_ = deps.Store.SaveValidationLog(r.Context(), store.AgenticValidationLog{
			TraceID: traceID, EntityID: entityID, EntityType: "listing",
			ValidationResult: isValid, Notes: string(notes),
		})

		out["trace_id"] = traceID
		servicekit.WriteJSON(w, http.StatusOK, out)
	}
}

func reportGenerateHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{
			"report_url": "https://mypal.app/reports/demo.pdf",
			"summary":    "Report generated successfully.",
			"trace_id":   traceID,
		})
	}
}

func sellerReportHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sellerID := r.PathValue("sellerId")
		if !uuidRe.MatchString(strings.ToLower(sellerID)) {
			servicekit.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}

		report, err := deps.Upstreams.LatestSellerReport(r.Context(), sellerID)
		if err != nil || report == nil {
			servicekit.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, report)
	}
}

// ─── Feature history ──────────────────────────────────────────────────────────

func historyHandler(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			servicekit.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{
			"history": deps.Store.FeatureHistory(r.Context(), userID, r.PathValue("feature")),
		})
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func callerID(r *http.Request) string {
	if id := servicekit.IdentityFrom(r.Context()); id != nil {
		return id.UserID
	}
	return ""
}

// NewTraceID is used where a caller did not supply one.
func NewTraceID() string { return uuid.NewString() }
