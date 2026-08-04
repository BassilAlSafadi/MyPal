// Package httpapi exposes the messaging service's REST surface.
//
// Chat thread routes keep the /api/v1/ai/threads paths the SPA already calls, so
// the frontend needed no change beyond pointing at this service. Support ticket
// routes keep the /api/v1/support prefix the gateway used to proxy.
package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"mypal/api/go/internal/messaging/aiclient"
	"mypal/api/go/internal/messaging/store"
	"mypal/api/go/internal/servicekit"
)

// Deps are the collaborators the routes need.
type Deps struct {
	Store     *store.Store
	AI        *aiclient.Client
	JWTSecret string
}

// Register wires every route and returns the root handler.
func Register(mux *http.ServeMux, deps Deps) http.Handler {
	base := servicekit.Chain(
		servicekit.CorrelationID,
		servicekit.StructuredLogging,
		servicekit.PanicRecovery,
	)

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
			"service": "MyPal messaging service",
			"version": "1.0.0",
			"status":  "ok",
			"storage": "mongodb",
			"endpoints": []string{
				"POST   /api/v1/ai/threads",
				"GET    /api/v1/ai/threads",
				"GET    /api/v1/ai/threads/{id}",
				"DELETE /api/v1/ai/threads/{id}",
				"POST   /api/v1/ai/threads/{id}/messages",
				"GET    /api/v1/support/tickets",
				"POST   /api/v1/support/tickets",
				"GET    /api/v1/support/tickets/{id}",
				"PATCH  /api/v1/support/tickets/{id}/status",
				"GET    /api/v1/support/tickets/{id}/negotiation",
				"POST   /api/v1/support/tickets/{id}/negotiation/messages",
				"GET    /health",
			},
		})
	})))

	mux.Handle("GET /health", base(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		servicekit.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "messaging"})
	})))

	// ── Chat threads ─────────────────────────────────────────────────────────
	mux.Handle("POST /api/v1/ai/threads", authed(createThread(deps)))
	mux.Handle("GET /api/v1/ai/threads", authed(listThreads(deps)))
	mux.Handle("GET /api/v1/ai/threads/{id}", authed(getThread(deps)))
	mux.Handle("DELETE /api/v1/ai/threads/{id}", authed(deleteThread(deps)))
	mux.Handle("POST /api/v1/ai/threads/{id}/messages", authed(sendThreadMessage(deps)))

	// ── Support tickets ──────────────────────────────────────────────────────
	mux.Handle("POST /api/v1/support/tickets", authed(createTicket(deps)))
	mux.Handle("GET /api/v1/support/tickets", authed(listTickets(deps)))
	mux.Handle("GET /api/v1/support/tickets/{id}", authed(getTicket(deps)))
	mux.Handle("PATCH /api/v1/support/tickets/{id}/status", authed(updateTicketStatus(deps)))

	// ── Negotiations ─────────────────────────────────────────────────────────
	mux.Handle("GET /api/v1/support/tickets/{id}/negotiation", authed(getNegotiation(deps)))
	mux.Handle("POST /api/v1/support/tickets/{id}/negotiation/messages", authed(appendNegotiationMessage(deps)))

	return servicekit.CORS(servicekit.AllowedOrigins())(mux)
}

// ─── Chat threads ─────────────────────────────────────────────────────────────

func createThread(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		thread, err := deps.Store.CreateThread(r.Context(), userID)
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"thread": thread})
	}
}

func listThreads(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		threads, err := deps.Store.ListThreads(r.Context(), userID)
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"threads": threads})
	}
}

func getThread(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		thread, err := deps.Store.GetThread(r.Context(), userID, r.PathValue("id"))
		if errors.Is(err, store.ErrNotFound) {
			notFound(w)
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"thread": thread})
	}
}

func deleteThread(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		if err := deps.Store.DeleteThread(r.Context(), userID, r.PathValue("id")); err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

// sendThreadMessage appends the user's turn, asks the AI service for the reply,
// and appends that too. Runs synchronously (~6s) — a single model call, no
// background/polling workflow, exactly as the Node handler did.
func sendThreadMessage(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := servicekit.TraceIDFrom(r.Context())
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		var body struct {
			Query            string           `json:"query"`
			InternalProducts []map[string]any `json:"internal_products"`
		}
		if err := servicekit.DecodeJSON(r, &body); err != nil || strings.TrimSpace(body.Query) == "" {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "query is required", "trace_id": traceID})
			return
		}
		query := strings.TrimSpace(body.Query)

		threadID := r.PathValue("id")
		thread, err := deps.Store.GetThread(r.Context(), userID, threadID)
		if errors.Is(err, store.ErrNotFound) {
			servicekit.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "not found", "trace_id": traceID})
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}

		// Conversation history (prior turns) so the model has memory of the thread.
		history := make([]aiclient.Message, 0, len(thread.Messages))
		for _, m := range thread.Messages {
			history = append(history, aiclient.Message{Role: m.Role, Content: m.Content})
		}

		// The first message names the thread.
		title := thread.Title
		if len(thread.Messages) == 0 {
			title = query
			if len(title) > 60 {
				title = title[:60]
			}
		}

		now := time.Now().UTC()
		userMessage := store.ChatMessage{
			ID:               uuid.NewString(),
			Role:             "user",
			Content:          query,
			InternalProducts: body.InternalProducts,
			CreatedAt:        now,
		}

		answer, err := deps.AI.FastSearch(r.Context(), bearerToken(r), query, body.InternalProducts, history)
		if err != nil {
			servicekit.WriteJSON(w, http.StatusBadGateway, map[string]any{
				"error": "ai service unavailable", "trace_id": traceID,
			})
			return
		}

		products := answer.Products
		if products == nil {
			products = []any{}
		}
		internal := body.InternalProducts
		if len(internal) > 5 {
			internal = internal[:5]
		}

		assistantMessage := store.ChatMessage{
			ID:               uuid.NewString(),
			Role:             "assistant",
			Content:          answer.Result,
			Status:           "done",
			Products:         products,
			InternalProducts: internal,
			CreatedAt:        time.Now().UTC(),
		}

		if err := deps.Store.AppendMessages(r.Context(), userID, threadID, title, userMessage, assistantMessage); err != nil {
			serverError(w, err)
			return
		}

		servicekit.WriteJSON(w, http.StatusOK, map[string]any{
			"message": assistantMessage, "thread_id": threadID, "trace_id": traceID,
		})
	}
}

// ─── Support tickets ──────────────────────────────────────────────────────────

func createTicket(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		var body struct {
			ProductID string `json:"product_id"`
			Subject   string `json:"subject"`
			Body      string `json:"body"`
			Priority  string `json:"priority"`
		}
		if err := servicekit.DecodeJSON(r, &body); err != nil || strings.TrimSpace(body.Subject) == "" {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "subject is required"})
			return
		}

		ticket, err := deps.Store.CreateTicket(r.Context(), store.SupportTicket{
			UserID:    userID,
			ProductID: body.ProductID,
			Subject:   strings.TrimSpace(body.Subject),
			Body:      body.Body,
			Priority:  body.Priority,
		})
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusCreated, map[string]any{"ticket": ticket})
	}
}

func listTickets(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		tickets, err := deps.Store.ListTickets(r.Context(), userID)
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"tickets": tickets})
	}
}

func getTicket(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		ticket, err := deps.Store.GetTicket(r.Context(), userID, r.PathValue("id"))
		if errors.Is(err, store.ErrNotFound) {
			notFound(w)
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"ticket": ticket})
	}
}

func updateTicketStatus(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := servicekit.DecodeJSON(r, &body); err != nil || !validTicketStatus(body.Status) {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]string{
				"error": "status must be one of: open, in_progress, resolved, closed",
			})
			return
		}

		err := deps.Store.UpdateTicketStatus(r.Context(), userID, r.PathValue("id"), body.Status)
		if errors.Is(err, store.ErrNotFound) {
			notFound(w)
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func validTicketStatus(status string) bool {
	switch status {
	case "open", "in_progress", "resolved", "closed":
		return true
	}
	return false
}

// ─── Negotiations ─────────────────────────────────────────────────────────────

func getNegotiation(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		ticketID := r.PathValue("id")
		// Ownership is enforced on the ticket, not the negotiation.
		if _, err := deps.Store.GetTicket(r.Context(), userID, ticketID); err != nil {
			notFound(w)
			return
		}

		session, err := deps.Store.NegotiationByTicket(r.Context(), ticketID)
		if errors.Is(err, store.ErrNotFound) {
			notFound(w)
			return
		}
		if err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]any{"negotiation": session})
	}
}

func appendNegotiationMessage(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := callerID(r)
		if userID == "" {
			unauthorized(w)
			return
		}

		ticketID := r.PathValue("id")
		if _, err := deps.Store.GetTicket(r.Context(), userID, ticketID); err != nil {
			notFound(w)
			return
		}

		var body struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		if err := servicekit.DecodeJSON(r, &body); err != nil || strings.TrimSpace(body.Content) == "" {
			servicekit.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "content is required"})
			return
		}

		role := body.Role
		if role != "buyer" && role != "seller" && role != "ai_broker" {
			role = "buyer"
		}

		if err := deps.Store.AppendNegotiationMessage(r.Context(), ticketID, store.NegotiationMessage{
			Role: role, Content: strings.TrimSpace(body.Content),
		}); err != nil {
			serverError(w, err)
			return
		}
		servicekit.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func callerID(r *http.Request) string {
	if id := servicekit.IdentityFrom(r.Context()); id != nil {
		return id.UserID
	}
	return ""
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	}
	return ""
}

func unauthorized(w http.ResponseWriter) {
	servicekit.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}

func notFound(w http.ResponseWriter) {
	servicekit.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func serverError(w http.ResponseWriter, err error) {
	servicekit.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}
