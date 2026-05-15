// Package auth provides JWT validation and identity context propagation
// for the Go Gateway. The Gateway validates tokens but NEVER issues them —
// that is exclusively the responsibility of the C# Main API.
//
// Identity context is extracted from validated JWT claims and forwarded
// to upstream services via trusted internal headers:
//
//	X-User-Id, X-User-Roles, X-Trace-Id
package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ContextKey is the package-local type for context keys.
type ContextKey string

const (
	// IdentityKey is the context key for a validated UserIdentity.
	IdentityKey ContextKey = "identity"

	// HeaderUserID is the trusted internal header forwarded to upstream services.
	HeaderUserID    = "X-User-Id"
	HeaderUserRoles = "X-User-Roles"
	HeaderUserEmail = "X-User-Email"
)

// UserIdentity holds the verified claims extracted from a validated JWT.
// This is the canonical shape that crosses service boundaries via internal headers.
type UserIdentity struct {
	UserID   string
	Email    string
	Roles    []string
	IsBuyer  bool
	IsSeller bool
}

// MyPalClaims defines the canonical JWT claims issued by the C# Main API.
// The `roles` claim carries comma-separated role names: "buyer", "seller", "admin".
type MyPalClaims struct {
	Email    string `json:"email"`
	Roles    string `json:"roles"` // "buyer,seller" or "buyer" etc.
	IsBuyer  bool   `json:"is_buyer"`
	IsSeller bool   `json:"is_seller"`
	jwt.RegisteredClaims
}

// Validator validates JWTs using an HS256 shared secret.
// The Gateway never issues tokens; it only validates and extracts claims.
type Validator struct {
	secret   []byte
	issuer   string
	audience string
}

// NewValidator creates a Validator with the provided HS256 secret.
// issuer and audience are optional but strongly recommended in production.
func NewValidator(secret, issuer, audience string) *Validator {
	return &Validator{
		secret:   []byte(secret),
		issuer:   issuer,
		audience: audience,
	}
}

// ErrInvalidToken is returned for any JWT validation failure.
var (
	ErrInvalidToken  = errors.New("token is invalid")
	ErrTokenExpired  = errors.New("token has expired")
	ErrMissingClaims = errors.New("required claims are missing")
)

// Validate parses and validates a raw JWT string.
// Returns the extracted UserIdentity on success, or a typed error.
func (v *Validator) Validate(rawToken string) (*UserIdentity, error) {
	token, err := jwt.ParseWithClaims(rawToken, &MyPalClaims{}, func(t *jwt.Token) (interface{}, error) {
		// Enforce HS256 — reject any algorithm switching attack.
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return v.secret, nil
	},
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, fmt.Errorf("%w: %s", ErrInvalidToken, err.Error())
	}

	claims, ok := token.Claims.(*MyPalClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	// Validate required claims.
	if claims.Subject == "" {
		return nil, ErrMissingClaims
	}

	// Optional issuer check.
	if v.issuer != "" && claims.Issuer != v.issuer {
		return nil, fmt.Errorf("%w: issuer mismatch", ErrInvalidToken)
	}

	roles := parseRoles(claims.Roles)

	return &UserIdentity{
		UserID:   claims.Subject,
		Email:    claims.Email,
		Roles:    roles,
		IsBuyer:  claims.IsBuyer,
		IsSeller: claims.IsSeller,
	}, nil
}

// parseRoles splits a comma-separated roles string into a slice.
func parseRoles(raw string) []string {
	if raw == "" {
		return []string{"buyer"} // safe default
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// WithIdentity stores a UserIdentity in a context.
func WithIdentity(ctx context.Context, id *UserIdentity) context.Context {
	return context.WithValue(ctx, IdentityKey, id)
}

// IdentityFrom extracts a UserIdentity from a context.
// Returns nil if not present (unauthenticated context).
func IdentityFrom(ctx context.Context) *UserIdentity {
	id, _ := ctx.Value(IdentityKey).(*UserIdentity)
	return id
}

// LogAuthEvent writes a structured auth audit log.
func LogAuthEvent(event, userID, traceID string, success bool) {
	slog.Info("auth_event",
		"event", event,
		"user_id", userID,
		"trace_id", traceID,
		"success", success,
		"ts", time.Now().UTC().Format(time.RFC3339),
	)
}
