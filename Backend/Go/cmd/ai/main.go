// Command ai is the MyPal AI service — the Go port of the former Node.js
// orchestrator (Backend/Node), backed by MongoDB.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"mypal/api/go/internal/ai/clients"
	"mypal/api/go/internal/ai/httpapi"
	"mypal/api/go/internal/ai/llm"
	"mypal/api/go/internal/ai/store"
	"mypal/api/go/internal/servicekit"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	// Repo-root .env first, then a service-local one, matching the Node service.
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load(".env")

	port := servicekit.Env("PORT", servicekit.Env("AI_SERVICE_PORT", "5003"))

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		slog.Error("ai: JWT_SECRET is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// MongoDB is optional. Without it the service still answers every request;
	// only the audit trail, search log, feature history and quota are disabled —
	// the same degradation the Node service had with no MONGO_URL.
	mongoURI := servicekit.Env("AI_MONGO_URL", servicekit.Env("MONGO_URL", os.Getenv("MONGO_URI")))
	mongoStore, err := store.New(ctx, mongoURI, servicekit.Env("AI_MONGO_DB", "mypal_ai"))
	if err != nil {
		slog.Warn("ai: MongoDB unavailable — audit logging, history and quota disabled", "err", err)
		mongoStore = nil
	} else if mongoStore == nil {
		slog.Info("ai: no MONGO_URL configured — audit logging, history and quota disabled")
	} else {
		slog.Info("ai: connected to MongoDB")
	}

	cache := servicekit.NewCache(ctx, os.Getenv("REDIS_URL"), "ai")
	defer cache.Close()

	upstreams := clients.New(
		servicekit.Env("LISTINGS_SERVICE_URL", "http://localhost:5002"),
		servicekit.Env("ORDERS_SERVICE_URL", "http://localhost:5004"),
		os.Getenv("INTERNAL_SERVICE_TOKEN"),
		cache,
	)

	mux := http.NewServeMux()
	handler := httpapi.Register(mux, httpapi.Deps{
		Provider:  llm.NewProvider(),
		Store:     mongoStore,
		Upstreams: upstreams,
		JWTSecret: jwtSecret,
	})

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: handler,
		// AI pipelines are long-running: the agentic workflow chains many model
		// calls, so the write budget is far larger than a normal CRUD service.
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("ai: listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("ai: server error", "err", err)
			os.Exit(1)
		}
	}()

	<-stop
	slog.Info("ai: shutdown signal received")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		slog.Error("ai: shutdown error", "err", err)
	}
	slog.Info("ai: stopped cleanly")
}
