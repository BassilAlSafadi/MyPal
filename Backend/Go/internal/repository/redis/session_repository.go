package redis

import (
	"context"
	"time"
)

type SessionRepository interface {
	SetSession(ctx context.Context, key string, value interface{}, expiration time.Duration) error
	GetSession(ctx context.Context, key string) (string, error)
}

type sessionRepository struct {
	// redis client reference
}

func NewSessionRepository() SessionRepository {
	return &sessionRepository{}
}

func (r *sessionRepository) SetSession(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return nil
}

func (r *sessionRepository) GetSession(ctx context.Context, key string) (string, error) {
	return "", nil
}
