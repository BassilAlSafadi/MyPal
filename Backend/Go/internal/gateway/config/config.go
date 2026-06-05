package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// GatewayConfig holds all typed configuration for the Go Gateway.
type GatewayConfig struct {
	Port         string
	Timeout      GatewayTimeouts
	Upstreams    Upstreams
	Auth         AuthConfig
	RateLimit    RateLimitConfig
	Messaging    MessagingConfig
	CORS         CORSConfig
	MaxBodyBytes int64
}

// GatewayTimeouts defines per-upstream timeout budgets.
type GatewayTimeouts struct {
	CSharpAPI        time.Duration
	GoSupport        time.Duration
	NodeOrchestrator time.Duration
	ProdBERT         time.Duration
	Default          time.Duration
}

// Upstreams holds all internal service base URLs (HTTP) and gRPC addresses.
type Upstreams struct {
	CSharpMainAPI    string
	GoSupportService string
	NodeOrchestrator string
	PythonProdBERT   string
	// gRPC addresses (host:port, no scheme).
	CSharpGRPC  string
	NodeGRPC    string
	SupportGRPC string
}

// AuthConfig holds JWT and internal service auth config.
type AuthConfig struct {
	JWTSecret            string
	InternalServiceToken string
}

// RateLimitConfig holds rate limiting configuration.
type RateLimitConfig struct {
	RequestsPerSecond int
	BurstSize         int
}

// MessagingConfig holds NATS and worker lifecycle configuration.
type MessagingConfig struct {
	Enabled                bool
	NATSURL                string
	OutboxInterval         time.Duration
	ReconciliationInterval time.Duration
}

// CORSConfig holds browser-origin policy for the public gateway.
type CORSConfig struct {
	AllowedOrigins []string
}

// Load reads configuration from environment variables with typed defaults.
func Load() (*GatewayConfig, error) {
	cfg := &GatewayConfig{
		// Honour Render/Heroku-style $PORT first, then the explicit gateway var.
		Port:         getEnv("GO_GATEWAY_PORT", getEnv("PORT", "8080")),
		MaxBodyBytes: int64(getEnvInt("GATEWAY_MAX_BODY_BYTES", 4*1024*1024)), // 4MB
		Timeout: GatewayTimeouts{
			CSharpAPI:        getEnvDuration("TIMEOUT_CSHARP_MS", 5000),
			GoSupport:        getEnvDuration("TIMEOUT_GO_SUPPORT_MS", 5000),
			// Pro deep-search runs the full 14-node agentic workflow (~60-90s),
			// so the Node budget is generous to avoid cutting off a near-complete run.
			NodeOrchestrator: getEnvDuration("TIMEOUT_NODE_ORCH_MS", 180000),
			ProdBERT:         getEnvDuration("TIMEOUT_PRODBERT_MS", 3000),
			Default:          getEnvDuration("TIMEOUT_DEFAULT_MS", 10000),
		},
		Upstreams: Upstreams{
			CSharpMainAPI:    getEnv("CSHARP_MAIN_API_URL", "http://localhost:5000"),
			GoSupportService: getEnv("GO_SUPPORT_URL", "http://localhost:5001"),
			NodeOrchestrator: getEnv("NODE_ORCHESTRATOR_URL", "http://localhost:5003"),
			PythonProdBERT:   getEnv("PRODBERT_URL", "http://localhost:8001"),
			// gRPC addresses (no scheme, just host:port)
			CSharpGRPC:  getEnv("CSHARP_GRPC_ADDR", "localhost:5010"),
			NodeGRPC:    getEnv("NODE_GRPC_ADDR", "localhost:5013"),
			SupportGRPC: getEnv("SUPPORT_GRPC_ADDR", "localhost:5011"),
		},
		Auth: AuthConfig{
			JWTSecret:            os.Getenv("JWT_SECRET"),
			InternalServiceToken: os.Getenv("INTERNAL_SERVICE_TOKEN"),
		},
		RateLimit: RateLimitConfig{
			RequestsPerSecond: getEnvInt("RATE_LIMIT_RPS", 100),
			BurstSize:         getEnvInt("RATE_LIMIT_BURST", 200),
		},
		Messaging: MessagingConfig{
			// Disable to run without NATS (no outbox/reconciliation workers) —
			// used for the lean cloud deployment where messaging isn't provisioned.
			Enabled:                getEnvBool("MESSAGING_ENABLED", true),
			NATSURL:                getEnv("NATS_URL", "nats://127.0.0.1:4222"),
			OutboxInterval:         getEnvDuration("OUTBOX_WORKER_INTERVAL_MS", 1000),
			ReconciliationInterval: getEnvDuration("RECONCILIATION_WORKER_INTERVAL_MS", 30000),
		},
		CORS: CORSConfig{
			AllowedOrigins: getEnvList("CORS_ALLOWED_ORIGINS", []string{
				"http://localhost:5173",
				"http://127.0.0.1:5173",
				// Wildcard covers every Vercel preview and production URL for this
				// account — no gateway redeploy needed when Vercel creates a new URL.
				"https://*-solly2005s-projects.vercel.app",
				"https://mypal.vercel.app",
			}),
		},
	}

	if cfg.Auth.InternalServiceToken == "" {
		return nil, fmt.Errorf("INTERNAL_SERVICE_TOKEN is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getEnvList(key string, fallback []string) []string {
	if v := os.Getenv(key); v != "" {
		parts := strings.Split(v, ",")
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				out = append(out, trimmed)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return fallback
}

// getEnvDuration reads milliseconds from env and returns a time.Duration.
func getEnvDuration(key string, fallbackMS int) time.Duration {
	ms := getEnvInt(key, fallbackMS)
	return time.Duration(ms) * time.Millisecond
}
