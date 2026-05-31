package redis

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

type SessionRepository interface {
	SetSession(ctx context.Context, key string, value interface{}, expiration time.Duration) error
	GetSession(ctx context.Context, key string) (string, error)
}

type sessionRepository struct {
	client goredis.Cmdable
}

func NewSessionRepository(client goredis.Cmdable) SessionRepository {
	return &sessionRepository{client: client}
}

func (r *sessionRepository) SetSession(ctx context.Context, key string, value interface{}, _ time.Duration) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("redis.SetSession: nil client")
	}
	if err := r.client.Set(ctx, key, value, redisCacheTTL).Err(); err != nil {
		return fmt.Errorf("redis.SetSession: %w", err)
	}
	return nil
}

func (r *sessionRepository) GetSession(ctx context.Context, key string) (string, error) {
	if r == nil || r.client == nil {
		return "", fmt.Errorf("redis.GetSession: nil client")
	}
	value, err := r.client.Get(ctx, key).Result()
	if err == goredis.Nil {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("redis.GetSession: %w", err)
	}
	if err := r.client.Expire(ctx, key, redisCacheTTL).Err(); err != nil {
		return "", fmt.Errorf("redis.GetSession: refresh ttl: %w", err)
	}
	return value, nil
}
