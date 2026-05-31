// Command backfill-embeddings populates public.product_embeddings with a 384-dim
// vector for every active product, using the Go embedding service (/embed).
// Run once after creating the product_embeddings table:
//
//	POSTGRES_URL=... EMBED_URL=http://localhost:8001 go run ./cmd/backfill-embeddings
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type product struct {
	id   string
	text string
}

func main() {
	pgURL := firstNonEmpty(os.Getenv("POSTGRES_URL"), os.Getenv("POSTGRES_SESSION_URL"))
	if pgURL == "" {
		log.Fatal("POSTGRES_URL is required")
	}
	embedURL := os.Getenv("EMBED_URL")
	if embedURL == "" {
		embedURL = "http://localhost:8001"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, pgURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, `
		SELECT id, name, COALESCE(description,''), COALESCE(category,'')
		FROM public.products WHERE is_deleted IS NOT TRUE`)
	if err != nil {
		log.Fatalf("query products: %v", err)
	}
	var products []product
	for rows.Next() {
		var id, name, desc, cat string
		if err := rows.Scan(&id, &name, &desc, &cat); err != nil {
			log.Fatalf("scan: %v", err)
		}
		products = append(products, product{id: id, text: strings.TrimSpace(name + ". " + desc + ". " + cat)})
	}
	rows.Close()
	log.Printf("loaded %d products", len(products))
	if len(products) == 0 {
		return
	}

	// Embed in batches of 50.
	const batch = 50
	inserted := 0
	for start := 0; start < len(products); start += batch {
		end := start + batch
		if end > len(products) {
			end = len(products)
		}
		chunk := products[start:end]
		texts := make([]string, len(chunk))
		for i, p := range chunk {
			texts[i] = p.text
		}

		embeddings, err := callEmbed(embedURL, texts)
		if err != nil {
			log.Fatalf("embed batch %d-%d: %v", start, end, err)
		}
		if len(embeddings) != len(chunk) {
			log.Fatalf("embed returned %d vectors for %d texts", len(embeddings), len(chunk))
		}

		for i, p := range chunk {
			lit := formatVector(embeddings[i])
			_, err := pool.Exec(ctx, `
				INSERT INTO public.product_embeddings (product_id, embedding, updated_at)
				VALUES ($1, $2::vector, now())
				ON CONFLICT (product_id) DO UPDATE
				SET embedding = EXCLUDED.embedding, updated_at = now()`, p.id, lit)
			if err != nil {
				log.Fatalf("insert %s: %v", p.id, err)
			}
			inserted++
		}
		log.Printf("embedded+stored %d/%d", inserted, len(products))
	}
	log.Printf("done: %d product embeddings written", inserted)
}

func callEmbed(baseURL string, texts []string) ([][]float64, error) {
	body, _ := json.Marshal(map[string][]string{"texts": texts})
	req, _ := http.NewRequest(http.MethodPost, baseURL+"/embed", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embed %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Embeddings [][]float64 `json:"embeddings"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out.Embeddings, nil
}

func formatVector(v []float64) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%.8f", f)
	}
	b.WriteByte(']')
	return b.String()
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
