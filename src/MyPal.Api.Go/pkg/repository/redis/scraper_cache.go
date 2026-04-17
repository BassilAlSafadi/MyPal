package redis

import "time"

// ScraperCache is the cached payload for a high-concurrency scrape request.
type ScraperCache struct {
	Key       string    `json:"key"`
	Payload   []byte    `json:"payload"`
	CachedAt  time.Time `json:"cached_at"`
	SourceURL string    `json:"source_url,omitempty"`
}
