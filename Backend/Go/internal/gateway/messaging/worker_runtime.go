package messaging

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
)

type RuntimeWorker interface {
	Start(ctx context.Context)
}

type WorkerRuntime struct {
	workers []RuntimeWorker

	cancel context.CancelFunc
	wg     sync.WaitGroup

	started  atomic.Bool
	stopped  atomic.Bool
	stopping atomic.Bool
	mu       sync.Mutex
}

func NewWorkerRuntime(workers ...RuntimeWorker) *WorkerRuntime {
	return &WorkerRuntime{workers: workers}
}

func (r *WorkerRuntime) Start(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.started.Load() && !r.stopped.Load() {
		return fmt.Errorf("worker runtime already started")
	}
	if len(r.workers) == 0 {
		return fmt.Errorf("worker runtime has no workers")
	}

	runCtx, cancel := context.WithCancel(ctx)
	r.cancel = cancel
	r.stopping.Store(false)
	r.stopped.Store(false)

	for _, worker := range r.workers {
		w := worker
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()
			w.Start(runCtx)
		}()
	}

	r.started.Store(true)
	return nil
}

func (r *WorkerRuntime) Shutdown(ctx context.Context) error {
	r.mu.Lock()
	cancel := r.cancel
	r.mu.Unlock()

	if cancel != nil {
		r.stopping.Store(true)
		cancel()
	}

	done := make(chan struct{})
	go func() {
		r.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		r.stopped.Store(true)
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *WorkerRuntime) Ready() bool {
	return r.started.Load() && !r.stopped.Load() && !r.stopping.Load()
}

func (r *WorkerRuntime) ReadinessCheck(context.Context) error {
	if !r.Ready() {
		return fmt.Errorf("worker runtime is not ready")
	}
	return nil
}
