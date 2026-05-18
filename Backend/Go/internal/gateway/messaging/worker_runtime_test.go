package messaging

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

type fakeRuntimeWorker struct {
	started atomic.Bool
	stopped atomic.Bool
	block   bool
}

func (w *fakeRuntimeWorker) Start(ctx context.Context) {
	w.started.Store(true)
	if w.block {
		<-ctx.Done()
	}
	w.stopped.Store(true)
}

func TestWorkerRuntimeStartupLifecycle(t *testing.T) {
	worker := &fakeRuntimeWorker{block: true}
	runtime := NewWorkerRuntime(worker)

	if err := runtime.Start(context.Background()); err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	deadline := time.Now().Add(time.Second)
	for !worker.started.Load() && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if !worker.started.Load() {
		t.Fatal("worker did not start")
	}
	if !runtime.Ready() {
		t.Fatal("runtime is not ready after start")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := runtime.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown returned error: %v", err)
	}
	if runtime.Ready() {
		t.Fatal("runtime is still ready after shutdown")
	}
	if !worker.stopped.Load() {
		t.Fatal("worker did not stop after shutdown")
	}
}

func TestWorkerRuntimeGracefulShutdownTimeoutIsObservable(t *testing.T) {
	worker := RuntimeWorkerFunc(func(context.Context) {
		select {}
	})
	runtime := NewWorkerRuntime(worker)
	if err := runtime.Start(context.Background()); err != nil {
		t.Fatalf("Start returned error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if err := runtime.Shutdown(ctx); err == nil {
		t.Fatal("Shutdown succeeded unexpectedly")
	}
	if runtime.Ready() {
		t.Fatal("runtime remained ready after shutdown began")
	}
}

type RuntimeWorkerFunc func(context.Context)

func (f RuntimeWorkerFunc) Start(ctx context.Context) {
	f(ctx)
}
