// Package clients lets the AI service read data owned by other services.
//
// The Node orchestrator held its own Postgres pool and queried products,
// wishlist_items, orders and seller_performance_summaries directly. Those tables
// now live in mypal_listings and mypal_orders behind the listings and orders
// services, and the AI service is on MongoDB, so the same reads are HTTP calls.
// Responses are cached on the shared 5 hour policy.
package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"mypal/api/go/internal/ai/agents"
	"mypal/api/go/internal/servicekit"
)

// Clients bundles the upstream services the AI service reads from.
type Clients struct {
	listingsURL   string
	ordersURL     string
	internalToken string
	http          *http.Client
	cache         *servicekit.Cache
}

func New(listingsURL, ordersURL, internalToken string, cache *servicekit.Cache) *Clients {
	return &Clients{
		listingsURL:   listingsURL,
		ordersURL:     ordersURL,
		internalToken: internalToken,
		http:          &http.Client{Timeout: 15 * time.Second},
		cache:         cache,
	}
}

// Catalog fetches the active product catalogue: id, title, category, price and
// primary image. Cached, since every recommendation request needs it.
func (c *Clients) Catalog(ctx context.Context, limit int) []agents.CatalogProduct {
	cacheKey := fmt.Sprintf("catalog:%d", limit)

	var cached []agents.CatalogProduct
	if c.cache.GetJSON(ctx, cacheKey, &cached) {
		return cached
	}

	var payload struct {
		Products []struct {
			ID       string  `json:"id"`
			Name     string  `json:"name"`
			Category string  `json:"category"`
			Price    float64 `json:"current_price"`
			Image    *string `json:"image"`
		} `json:"products"`
	}
	if err := c.get(ctx, c.listingsURL, fmt.Sprintf("/internal/catalog?limit=%d", limit), &payload); err != nil {
		slog.Warn("ai: catalog fetch failed", "err", err)
		return nil
	}

	catalog := make([]agents.CatalogProduct, 0, len(payload.Products))
	for _, p := range payload.Products {
		catalog = append(catalog, agents.CatalogProduct{
			ID: p.ID, Title: p.Name, Category: p.Category, Price: p.Price, Image: p.Image,
		})
	}

	c.cache.SetJSON(ctx, cacheKey, catalog)
	return catalog
}

// NamedItem is a product name/category pair, as used to build a persona.
type NamedItem struct {
	Name     string `json:"name"`
	Category string `json:"category"`
}

// WishlistFor returns the products a user has saved.
func (c *Clients) WishlistFor(ctx context.Context, userID string) []NamedItem {
	var payload struct {
		Items []NamedItem `json:"items"`
	}
	if err := c.get(ctx, c.listingsURL, "/internal/users/"+userID+"/wishlist", &payload); err != nil {
		slog.Debug("ai: wishlist fetch failed", "err", err)
		return nil
	}
	return payload.Items
}

// PurchasesFor returns the products a user has bought, most recent first.
func (c *Clients) PurchasesFor(ctx context.Context, userID string) []NamedItem {
	var payload struct {
		Items []NamedItem `json:"items"`
	}
	if err := c.get(ctx, c.ordersURL, "/internal/users/"+userID+"/purchases", &payload); err != nil {
		slog.Debug("ai: purchase history fetch failed", "err", err)
		return nil
	}
	return payload.Items
}

// SellerReport is a stored seller performance summary.
type SellerReport struct {
	ID                 string   `json:"id"`
	SellerID           string   `json:"sellerId"`
	AIGeneratedSummary string   `json:"aiGeneratedSummary"`
	TopComplaintThemes []string `json:"topComplaintThemes"`
	SentimentScore     *float64 `json:"sentimentScore"`
	GrandmaScore       *int     `json:"grandmaScore"`
	CreatedAt          string   `json:"createdAt"`
}

// LatestSellerReport reads the most recent stored summary for a seller.
func (c *Clients) LatestSellerReport(ctx context.Context, sellerID string) (*SellerReport, error) {
	var report SellerReport
	if err := c.get(ctx, c.listingsURL, "/internal/sellers/"+sellerID+"/report", &report); err != nil {
		return nil, err
	}
	return &report, nil
}

// SaveSellerReport persists a generated summary. seller_performance_summaries is
// a listings-owned table, so the write goes through that service.
func (c *Clients) SaveSellerReport(ctx context.Context, body map[string]any) (map[string]any, error) {
	var stored map[string]any
	if err := c.post(ctx, c.listingsURL, "/internal/sellers/report", body, &stored); err != nil {
		return nil, err
	}
	return stored, nil
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

func (c *Clients) get(ctx context.Context, baseURL, path string, out any) error {
	return c.do(ctx, http.MethodGet, baseURL, path, nil, out)
}

func (c *Clients) post(ctx context.Context, baseURL, path string, body, out any) error {
	return c.do(ctx, http.MethodPost, baseURL, path, body, out)
}

func (c *Clients) do(ctx context.Context, method, baseURL, path string, body, out any) error {
	if baseURL == "" {
		return fmt.Errorf("no upstream configured for %s", path)
	}

	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.internalToken != "" {
		req.Header.Set("X-Internal-Token", c.internalToken)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%s %s: HTTP %d", method, path, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
