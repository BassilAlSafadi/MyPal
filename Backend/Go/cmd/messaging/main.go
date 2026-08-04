// Command messaging is the MyPal messaging service — chat threads, support
// tickets and negotiation sessions, on MongoDB.
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

	"mypal/api/go/internal/messaging/aiclient"
	"mypal/api/go/internal/messaging/httpapi"
	"mypal/api/go/internal/messaging/store"
	"mypal/api/go/internal/servicekit"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	_ = godotenv.Load("../../.env")
	_ = godotenv.Load(".env")

	port := servicekit.Env("PORT", servicekit.Env("MESSAGING_SERVICE_PORT", "5001"))

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		slog.Error("messaging: JWT_SECRET is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Unlike the AI service, Mongo is required here: the conversations are the service.
	mongoURI := servicekit.Env("MESSAGING_MONGO_URL", servicekit.Env("MONGO_URL", os.Getenv("MONGO_URI")))
	mongoStore, err := store.New(ctx, mongoURI, servicekit.Env("MESSAGING_MONGO_DB", "mypal_messaging"))
	if err != nil {
		slog.Error("messaging: MongoDB connection failed", "err", err)
		os.Exit(1)
	}
	slog.Info("messaging: connected to MongoDB")

	// Redis is warmed here so the service participates in the shared 5 hour cache
	// policy; thread reads are served from Mongo directly, which is already fast.
	cache := servicekit.NewCache(ctx, os.Getenv("REDIS_URL"), "messaging")
	defer cache.Close()

	mux := http.NewServeMux()
	handler := httpapi.Register(mux, httpapi.Deps{
		Store: mongoStore,
		AI: aiclient.New(
			servicekit.Env("AI_SERVICE_URL", "http://localhost:5003"),
			os.Getenv("INTERNAL_SERVICE_TOKEN"),
		),
		JWTSecret: jwtSecret,
	})

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: handler,
		// Sending a thread message blocks on the AI service's model call, so the
		// write budget matches that service's.
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("messaging: listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("messaging: server error", "err", err)
			os.Exit(1)
		}
	}()

	<-stop
	slog.Info("messaging: shutdown signal received")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		slog.Error("messaging: shutdown error", "err", err)
	}
	slog.Info("messaging: stopped cleanly")
}
