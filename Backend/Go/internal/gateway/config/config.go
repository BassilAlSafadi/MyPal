package config

import (
	"fmt"
	"os"
	"strconv"
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

// Upstreams holds all internal service base URLs.
type Upstreams struct {
	CSharpMainAPI    string
	GoSupportService string
	NodeOrchestrator string
	PythonProdBERT   string
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
	NATSURL                string
	OutboxInterval         time.Duration
	ReconciliationInterval time.Duration
}

// Load reads configuration from environment variables with typed defaults.
func Load() (*GatewayConfig, error) {
	cfg := &GatewayConfig{
		Port:         getEnv("GO_GATEWAY_PORT", "8080"),
		MaxBodyBytes: int64(getEnvInt("GATEWAY_MAX_BODY_BYTES", 4*1024*1024)), // 4MB
		Timeout: GatewayTimeouts{
			CSharpAPI:        getEnvDuration("TIMEOUT_CSHARP_MS", 5000),
			GoSupport:        getEnvDuration("TIMEOUT_GO_SUPPORT_MS", 5000),
			NodeOrchestrator: getEnvDuration("TIMEOUT_NODE_ORCH_MS", 15000),
			ProdBERT:         getEnvDuration("TIMEOUT_PRODBERT_MS", 3000),
			Default:          getEnvDuration("TIMEOUT_DEFAULT_MS", 10000),
		},
		Upstreams: Upstreams{
			CSharpMainAPI:    getEnv("CSHARP_MAIN_API_URL", "http://localhost:5000"),
			GoSupportService: getEnv("GO_SUPPORT_URL", "http://localhost:5001"),
			NodeOrchestrator: getEnv("NODE_ORCHESTRATOR_URL", "http://localhost:5002"),
			PythonProdBERT:   getEnv("PRODBERT_URL", "http://localhost:8001"),
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
			NATSURL:                getEnv("NATS_URL", "nats://127.0.0.1:4222"),
			OutboxInterval:         getEnvDuration("OUTBOX_WORKER_INTERVAL_MS", 1000),
			ReconciliationInterval: getEnvDuration("RECONCILIATION_WORKER_INTERVAL_MS", 30000),
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

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// getEnvDuration reads milliseconds from env and returns a time.Duration.
func getEnvDuration(key string, fallbackMS int) time.Duration {
	ms := getEnvInt(key, fallbackMS)
	return time.Duration(ms) * time.Millisecond
}
