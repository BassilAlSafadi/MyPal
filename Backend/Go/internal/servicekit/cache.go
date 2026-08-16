package servicekit

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

// CacheTTL is the shared 5 hour expiry every MyPal microservice uses for cached
// reads. It matches redisCacheTTL in internal/repository/redis/cache_policy.go
// and RedisServiceCache.Ttl on the C# side.
const CacheTTL = 5 * time.Hour

// Cache is a per-service Redis read-through cache.
//
// A nil *Cache is fully usable and simply misses every time, so a service runs
// unchanged when REDIS_URL is unset or Redis is unreachable — the cache is an
// optimisation, never a dependency.
type Cache struct {
	client *redis.Client
	prefix string
}

// NewCache connects to Redis. It never returns an error: a failure to connect
// yields a nil Cache and the caller carries on without caching.
func NewCache(ctx context.Context, redisURL, serviceName string) *Cache {
	if redisURL == "" {
		slog.Info("cache: no REDIS_URL configured — reads go straight to the source", "service", serviceName)
		return nil
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Warn("cache: invalid REDIS_URL — continuing without cache", "service", serviceName, "err", err)
		return nil
	}

	client := redis.NewClient(opts)
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx).Err(); err != nil {
		slog.Warn("cache: Redis unreachable — continuing without cache", "service", serviceName, "err", err)
		_ = client.Close()
		return nil
	}

	slog.Info("cache: Redis connected", "service", serviceName, "ttl", CacheTTL.String())
	return &Cache{client: client, prefix: "mypal:" + serviceName + ":"}
}

// GetJSON loads key into v. Reports whether it was a hit.
func (c *Cache) GetJSON(ctx context.Context, key string, v any) bool {
	if c == nil {
		return false
	}
	raw, err := c.client.Get(ctx, c.prefix+key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(raw, v) == nil
}

// SetJSON stores v under key with the shared 5 hour TTL.
func (c *Cache) SetJSON(ctx context.Context, key string, v any) {
	if c == nil {
		return
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return
	}
	if err := c.client.Set(ctx, c.prefix+key, raw, CacheTTL).Err(); err != nil {
		slog.Debug("cache: write failed", "key", key, "err", err)
	}
}

// Invalidate drops the given keys.
func (c *Cache) Invalidate(ctx context.Context, keys ...string) {
	if c == nil || len(keys) == 0 {
		return
	}
	prefixed := make([]string, 0, len(keys))
	for _, k := range keys {
		prefixed = append(prefixed, c.prefix+k)
	}
	_ = c.client.Del(ctx, prefixed...).Err()
}

// Close releases the connection pool.
func (c *Cache) Close() {
	if c == nil {
		return
	}
	_ = c.client.Close()
}
