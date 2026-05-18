package saga

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/tracing"
)

// StatusHandler exposes durable saga status polling.
func StatusHandler(db *pgxpool.Pool) http.HandlerFunc {
	store := NewStore(db)

	return func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())
		sagaID := r.PathValue("saga_id")
		if sagaID == "" {
			responses.Error(w, http.StatusBadRequest, responses.CodeInvalidQuery, "saga id is required", traceID)
			return
		}

		status, err := store.GetStatus(r.Context(), sagaID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				responses.Error(w, http.StatusNotFound, "NOT_FOUND", "saga not found", traceID)
				return
			}
			slog.Error("saga: failed to fetch status", "err", err, "trace_id", traceID, "saga_id", sagaID)
			responses.InternalError(w, traceID)
			return
		}

		responses.OK(w, status)
	}
}
