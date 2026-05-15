package testutil

import (
	"context"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ResolvePostgresDSN returns a connection string for integration tests.
// Order: POSTGRES_TEST_URL → POSTGRES_URL → POSTGRES_* components.
func ResolvePostgresDSN() (string, bool) {
	dsn := ""
	if v := strings.TrimSpace(os.Getenv("POSTGRES_TEST_URL")); v != "" {
		dsn = v
	} else if v := strings.TrimSpace(os.Getenv("POSTGRES_URL")); v != "" {
		dsn = v
	}

	if dsn != "" {
		// Handle polyglot compatibility: C# uses Host=...; Go/pgx uses host=... (lowercase + spaces).
		if strings.Contains(dsn, ";") || strings.Contains(dsn, "Host=") {
			dsn = strings.ReplaceAll(dsn, ";", " ")
			dsn = strings.ReplaceAll(dsn, "Host=", "host=")
			dsn = strings.ReplaceAll(dsn, "Database=", "database=")
			dsn = strings.ReplaceAll(dsn, "Username=", "user=")
			dsn = strings.ReplaceAll(dsn, "Password=", "password=")
		}
		return dsn, true
	}

	host := envOr("POSTGRES_HOST", "localhost")
	port := envOr("POSTGRES_PORT", "5432")
	user := envOr("POSTGRES_USER", "postgres")
	pass := os.Getenv("POSTGRES_PASSWORD")
	db := envOr("POSTGRES_DB", "mypal")

	if pass == "" {
		return "", false
	}
	return fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", user, pass, host, port, db), true
}

// PostgresReachable pings Postgres using ResolvePostgresDSN.
func PostgresReachable(ctx context.Context) bool {
	dsn, ok := ResolvePostgresDSN()
	if !ok {
		return false
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return false
	}
	defer pool.Close()
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return pool.Ping(pingCtx) == nil
}

// RequirePostgres skips the test unless a DSN is configured and reachable.
func RequirePostgres(t interface {
	Helper()
	Skip(...any)
	Fatal(...any)
}) string {
	t.Helper()
	dsn, ok := ResolvePostgresDSN()
	if !ok {
		if os.Getenv("UAT_REQUIRE_DB") == "1" {
			t.Fatal("UAT_REQUIRE_DB=1 but no Postgres DSN (set POSTGRES_TEST_URL, POSTGRES_URL, or POSTGRES_* vars)")
		}
		t.Skip("Postgres DSN not configured (POSTGRES_TEST_URL or POSTGRES_URL)")
	}
	if !PostgresReachable(context.Background()) {
		if os.Getenv("UAT_REQUIRE_DB") == "1" {
			t.Fatal("UAT_REQUIRE_DB=1 but Postgres is not reachable at configured DSN")
		}
		t.Skip("Postgres is not reachable at configured DSN")
	}
	return dsn
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// TCPPortOpen is a fast pre-check without authentication.
func TCPPortOpen(host, port string) bool {
	addr := net.JoinHostPort(host, port)
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}
