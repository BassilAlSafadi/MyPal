package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"mypal/api/go/internal/gateway/tracing"
)

var idempotencyTracer = otel.Tracer("gateway-idempotency")

type responseInterceptor struct {
	http.ResponseWriter
	statusCode int
	body       bytes.Buffer
}

func (rw *responseInterceptor) WriteHeader(statusCode int) {
	rw.statusCode = statusCode
	rw.ResponseWriter.WriteHeader(statusCode)
}

func (rw *responseInterceptor) Write(b []byte) (int, error) {
	rw.body.Write(b)
	return rw.ResponseWriter.Write(b)
}

// Idempotency enforces deterministic replay for requests bearing the Idempotency-Key header.
func Idempotency(db *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			idempotencyKey := r.Header.Get("Idempotency-Key")
			if idempotencyKey == "" {
				// No key, skip idempotency
				next.ServeHTTP(w, r)
				return
			}

			ctx, span := idempotencyTracer.Start(r.Context(), "middleware.Idempotency", trace.WithAttributes(
				attribute.String("http.idempotency_key", idempotencyKey),
			))
			defer span.End()

			traceID := tracing.TraceIDFrom(ctx)

			// 1. Request fingerprinting (method + path + body hash if available)
			var bodyHash string
			if r.Body != nil {
				bodyBytes, _ := io.ReadAll(r.Body)
				r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes)) // restore
				hash := sha256.Sum256(bodyBytes)
				bodyHash = hex.EncodeToString(hash[:])
			}
			fingerprint := fmt.Sprintf("%s:%s:%s", r.Method, r.URL.Path, bodyHash)

			// 2. Check and Lock Idempotency Record
			tx, err := db.Begin(ctx)
			if err != nil {
				slog.Error("idempotency: failed to begin tx", "error", err)
				http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
				return
			}
			defer tx.Rollback(ctx)

			var status string
			var statusCode *int
			var responsePayload []byte
			var storedFingerprint string

			err = tx.QueryRow(ctx, `
				SELECT status, status_code, response_payload, fingerprint 
				FROM api_idempotency 
				WHERE idempotency_key = $1
				FOR UPDATE
			`, idempotencyKey).Scan(&status, &statusCode, &responsePayload, &storedFingerprint)

			if err == nil {
				// Record exists
				tx.Rollback(ctx) // release lock early

				if status == "IN_PROGRESS" {
					// Concurrent identical request
					slog.Warn("idempotency: concurrent request rejected", "key", idempotencyKey, "trace_id", traceID)
					span.AddEvent("Concurrent request rejected")
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusConflict)
					w.Write([]byte(`{"error":"concurrent_request_in_progress"}`))
					return
				}

				if status == "COMPLETED" {
					if storedFingerprint != fingerprint {
						slog.Warn("idempotency: fingerprint mismatch", "key", idempotencyKey, "trace_id", traceID)
						span.AddEvent("Fingerprint mismatch")
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusConflict)
						w.Write([]byte(`{"error":"idempotency_key_reuse_with_different_request"}`))
						return
					}
					// Replay previous response
					slog.Info("idempotency: replaying response", "key", idempotencyKey, "trace_id", traceID)
					span.AddEvent("Response replayed")
					w.Header().Set("Idempotent-Replay", "true")
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(*statusCode)
					w.Write(responsePayload)
					return
				}
			} else if err != pgx.ErrNoRows {
				slog.Error("idempotency: database error", "error", err)
				http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
				return
			}

			// 3. Create IN_PROGRESS record
			now := time.Now().UTC()
			_, err = tx.Exec(ctx, `
				INSERT INTO api_idempotency (idempotency_key, fingerprint, correlation_id, status, created_at, updated_at, expires_at)
				VALUES ($1, $2, $3, 'IN_PROGRESS', $4, $4, $5)
			`, idempotencyKey, fingerprint, traceID, now, now.Add(24*time.Hour))
			if err != nil {
				// likely unique constraint violation from a race
				tx.Rollback(ctx)
				slog.Warn("idempotency: concurrent insertion race", "key", idempotencyKey, "trace_id", traceID)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				w.Write([]byte(`{"error":"concurrent_request_in_progress"}`))
				return
			}

			if err := tx.Commit(ctx); err != nil {
				slog.Error("idempotency: failed to commit new record", "error", err)
				http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
				return
			}

			// 4. Intercept Downstream Handler
			interceptor := &responseInterceptor{
				ResponseWriter: w,
				statusCode:     http.StatusOK, // default if WriteHeader is never called
			}

			next.ServeHTTP(interceptor, r.WithContext(ctx))

			// 5. Save Response Payload
			updateCtx, updateCancel := context.WithTimeout(context.Background(), 5*time.Second) // detached context for safety
			defer updateCancel()

			_, err = db.Exec(updateCtx, `
				UPDATE api_idempotency
				SET status = 'COMPLETED',
				    status_code = $2,
				    response_payload = $3,
				    updated_at = now()
				WHERE idempotency_key = $1
			`, idempotencyKey, interceptor.statusCode, interceptor.body.Bytes())

			if err != nil {
				// We cannot return a 500 to the client since we already wrote the response,
				// but we must log it so we know idempotency was broken.
				slog.Error("idempotency: failed to save response payload", "key", idempotencyKey, "error", err)
			}
		})
	}
}
