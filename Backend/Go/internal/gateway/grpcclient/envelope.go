// Package grpcclient provides gRPC clients and HTTP adapter helpers for each
// internal backend service.  All services share the same Struct envelope
// protocol so the gateway never needs to understand payload content — it just
// translates HTTP ↔ gRPC envelopes.
package grpcclient

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	grpcstatus "google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"

	"mypal/api/go/internal/gateway/auth"
	"mypal/api/go/internal/gateway/responses"
	"mypal/api/go/internal/gateway/tracing"
)

// Dial opens an insecure gRPC connection to addr.  Returns a connection that
// should be closed by the caller (typically on process shutdown).
func Dial(addr string) (*grpc.ClientConn, error) {
	return grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
}

// buildEnvelope converts an incoming HTTP request into the Struct envelope that
// every backend gRPC service expects.
//
// Envelope structure:
//
//	{
//	  "body":           { ... },      // decoded request JSON body
//	  "query":          { ... },      // URL query params (all string values)
//	  "params":         { ... },      // URL path params (caller-supplied map)
//	  "user_id":        "...",
//	  "user_email":     "...",
//	  "user_roles":     "...",
//	  "internal_token": "..."
//	}
func buildEnvelope(r *http.Request, pathParams map[string]string, internalToken string) (*structpb.Struct, error) {
	// Decode body (best-effort; GET/DELETE typically have none).
	var body map[string]interface{}
	if r.Body != nil {
		raw, _ := io.ReadAll(r.Body)
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &body)
		}
	}

	query := make(map[string]interface{})
	for k, vs := range r.URL.Query() {
		if len(vs) > 0 {
			query[k] = vs[0]
		}
	}

	params := make(map[string]interface{})
	for k, v := range pathParams {
		params[k] = v
	}

	env := map[string]interface{}{
		"body":           body,
		"query":          query,
		"params":         params,
		"user_id":        r.Header.Get(auth.HeaderUserID),
		"user_email":     r.Header.Get(auth.HeaderUserEmail),
		"user_roles":     r.Header.Get(auth.HeaderUserRoles),
		"internal_token": internalToken,
		// Forward the raw Cookie header so backends can read httpOnly cookies
		// (e.g. mypal_refresh for the token-rotation fallback path).
		"cookie": r.Header.Get("Cookie"),
	}
	return structpb.NewStruct(env)
}

// writeEnvelope translates a response Struct envelope into an HTTP response.
//
// Expected response structure:
//
//	{
//	  "status":    200,
//	  "body":      { ... },
//	  "set_cookie": [ "name=val; Path=/; SameSite=None; Secure", ... ]
//	}
func writeEnvelope(w http.ResponseWriter, s *structpb.Struct, traceID string) {
	if s == nil {
		responses.InternalError(w, traceID)
		return
	}

	m := s.AsMap()

	// Forward any Set-Cookie headers the backend wants to plant.
	if cookies, ok := m["set_cookie"].([]interface{}); ok {
		for _, c := range cookies {
			if cv, ok := c.(string); ok && cv != "" {
				w.Header().Add("Set-Cookie", cv)
			}
		}
	}

	status := http.StatusOK
	if sv, ok := m["status"].(float64); ok && sv > 0 {
		status = int(sv)
	}

	body := m["body"]

	if status >= http.StatusBadRequest {
		msg := "upstream error"
		if bodyMap, ok := body.(map[string]interface{}); ok {
			for _, key := range []string{"message", "error", "detail"} {
				if v, ok := bodyMap[key].(string); ok && v != "" {
					msg = v
					break
				}
			}
		}
		responses.Error(w, status, responses.CodeUpstreamError, msg, traceID)
		return
	}

	responses.JSON(w, status, responses.Envelope{Success: true, Data: body})
}

// grpcError translates a gRPC status error into an HTTP response.
func grpcError(w http.ResponseWriter, err error, upstream, traceID string) {
	st, _ := grpcstatus.FromError(err)
	slog.Warn("grpc: upstream error",
		"upstream", upstream,
		"code", st.Code(),
		"msg", st.Message(),
		"trace_id", traceID,
	)
	switch st.Code() {
	case codes.DeadlineExceeded:
		responses.UpstreamTimeout(w, upstream, traceID)
	case codes.Unavailable:
		responses.UpstreamUnavailable(w, upstream, traceID)
	default:
		responses.Error(w, http.StatusBadGateway, responses.CodeUpstreamError, st.Message(), traceID)
	}
}

// invoke is the shared gRPC call helper used by all typed client wrappers.
// It invokes fullMethod (e.g. "/mypal.AuthService/Login") on cc with req and
// reads the response into a new Struct.
func invoke(ctx context.Context, cc grpc.ClientConnInterface, fullMethod string, req *structpb.Struct) (*structpb.Struct, error) {
	resp := new(structpb.Struct)
	return resp, cc.Invoke(ctx, fullMethod, req, resp)
}

// Handler builds an http.HandlerFunc that:
//  1. converts the incoming HTTP request into a Struct envelope,
//  2. calls fullMethod on conn,
//  3. converts the response envelope back to an HTTP response.
//
// pathParamNames lists the URL path-param names to extract via r.PathValue().
func Handler(conn grpc.ClientConnInterface, upstream, fullMethod string, internalToken string, pathParamNames ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		traceID := tracing.TraceIDFrom(r.Context())

		pp := make(map[string]string, len(pathParamNames))
		for _, name := range pathParamNames {
			pp[name] = r.PathValue(name)
		}

		env, err := buildEnvelope(r, pp, internalToken)
		if err != nil {
			slog.Error("grpc: failed to build envelope", "err", err, "trace_id", traceID)
			responses.InternalError(w, traceID)
			return
		}

		resp, err := invoke(r.Context(), conn, fullMethod, env)
		if err != nil {
			grpcError(w, err, upstream, traceID)
			return
		}

		writeEnvelope(w, resp, traceID)
	}
}
