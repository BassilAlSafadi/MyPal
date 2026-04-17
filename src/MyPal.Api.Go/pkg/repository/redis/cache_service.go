package redis

import (
	"context"
	"encoding/json"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

const ScraperCacheTTL = 15 * time.Minute

type CacheService struct {
	client *goredis.Client
}

func NewCacheServiceFromURL(redisURL string) (*CacheService, error) {
	opts, err := goredis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	return &CacheService{client: goredis.NewClient(opts)}, nil
}

func (c *CacheService) Close() error {
	if c == nil || c.client == nil {
		return nil
	}
	return c.client.Close()
}

func (c *CacheService) Ping(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}

func (c *CacheService) GetScraperCache(ctx context.Context, key string) (*ScraperCache, bool, error) {
	b, err := c.client.Get(ctx, key).Bytes()
	if err == goredis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var out ScraperCache
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, false, err
	}
	return &out, true, nil
}

func (c *CacheService) SetScraperCache(ctx context.Context, entry *ScraperCache) error {
	if entry.CachedAt.IsZero() {
		entry.CachedAt = time.Now().UTC()
	}
	b, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, entry.Key, b, ScraperCacheTTL).Err()
}

func (c *CacheService) GetShoppingCart(ctx context.Context, key string) (*ShoppingCarts, bool, error) {
	b, err := c.client.Get(ctx, key).Bytes()
	if err == goredis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var out ShoppingCarts
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, false, err
	}
	return &out, true, nil
}

func (c *CacheService) SetShoppingCart(ctx context.Context, key string, cart *ShoppingCarts, ttl time.Duration) error {
	if ttl <= 0 {
		ttl = ScraperCacheTTL
	}
	if cart.UpdatedAt.IsZero() {
		cart.UpdatedAt = time.Now().UTC()
	}
	b, err := json.Marshal(cart)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, key, b, ttl).Err()
}
