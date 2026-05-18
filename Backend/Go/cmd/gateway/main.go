// Command gateway is the MyPal API Gateway entry point.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"mypal/api/go/internal/gateway/config"
	"mypal/api/go/internal/gateway/messaging"
	"mypal/api/go/internal/gateway/routing"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("gateway: config error", "err", err)
		os.Exit(1)
	}

	slog.Info("gateway: configuration loaded",
		"port", cfg.Port,
		"csharp_url", cfg.Upstreams.CSharpMainAPI,
		"support_url", cfg.Upstreams.GoSupportService,
		"orchestrator_url", cfg.Upstreams.NodeOrchestrator,
		"prodbert_url", cfg.Upstreams.PythonProdBERT,
		"nats_url", cfg.Messaging.NATSURL,
	)

	postgresURL := os.Getenv("POSTGRES_URL")
	if postgresURL == "" {
		slog.Error("gateway: POSTGRES_URL is required for outbox runtime")
		os.Exit(1)
	}

	poolCtx, poolCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer poolCancel()

	db, err := pgxpool.New(poolCtx, postgresURL)
	if err != nil {
		slog.Error("gateway: failed to open pg pool", "err", err)
		os.Exit(1)
	}
	if pingErr := db.Ping(poolCtx); pingErr != nil {
		slog.Error("gateway: pg ping failed", "err", pingErr)
		db.Close()
		os.Exit(1)
	}
	slog.Info("gateway: postgres connected")

	eventBus, err := messaging.NewEventBus(cfg.Messaging.NATSURL)
	if err != nil {
		slog.Error("gateway: failed to connect NATS", "url", cfg.Messaging.NATSURL, "err", err)
		db.Close()
		os.Exit(1)
	}
	if err := eventBus.SetupStreams(); err != nil {
		slog.Error("gateway: failed to setup NATS streams", "err", err)
		eventBus.Close()
		db.Close()
		os.Exit(1)
	}

	outboxWorker := messaging.NewOutboxWorker(db, eventBus, cfg.Messaging.OutboxInterval)
	reconciliationWorker := messaging.NewReconciliationWorker(db, cfg.Messaging.ReconciliationInterval)
	workerRuntime := messaging.NewWorkerRuntime(outboxWorker, reconciliationWorker)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	if err := workerRuntime.Start(workerCtx); err != nil {
		slog.Error("gateway: failed to start worker runtime", "err", err)
		eventBus.Close()
		db.Close()
		os.Exit(1)
	}

	readiness := func(ctx context.Context) error {
		if err := workerRuntime.ReadinessCheck(ctx); err != nil {
			return err
		}
		if err := db.Ping(ctx); err != nil {
			return fmt.Errorf("postgres not ready: %w", err)
		}
		return nil
	}

	mux := http.NewServeMux()
	handler := routing.Register(mux, cfg, db, readiness)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("gateway: listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("gateway: server error", "err", err)
			os.Exit(1)
		}
	}()

	<-stop
	slog.Info("gateway: shutdown signal received")
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := workerRuntime.Shutdown(shutCtx); err != nil {
		slog.Error("gateway: worker runtime shutdown error", "err", err)
	}
	if err := srv.Shutdown(shutCtx); err != nil {
		slog.Error("gateway: shutdown error", "err", err)
	}
	eventBus.Close()
	db.Close()
	slog.Info("gateway: stopped cleanly")
}
