package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"mypal/api/go/internal/models"
	"mypal/api/go/internal/security"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/mongo"
)

func seedMongo(db *mongo.Database) {
	coll := db.Collection("negotiation_sessions")

	sessions := []interface{}{
		models.NegotiationSession{
			TicketID: "TKT-1001", // Matches a Postgres UUID later
			Status:   "open",
			Messages: []models.Message{
				{Role: "buyer", Content: "Hey, can I see more photos of the GPU?", Timestamp: time.Now()},
				{Role: "seller", Content: "Sure, check the MyPal product media gallery.", Timestamp: time.Now().Add(time.Minute * 2)},
			},
			UpdatedAt: time.Now(),
		},
		// ... loop this 100 times with variations
	}
	coll.InsertMany(context.TODO(), sessions)
}
func main() {
	fmt.Println("MyPal Support Go Service Starting...")

	// Start a minimal HTTP server for health checks and SSQL validation
	port := os.Getenv("GO_SERVER_PORT")
	if port == "" {
		port = "5001"
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	http.HandleFunc("/validate-ssql", security.ValidateHandler)

	// Optional: connect to Postgres if POSTGRES_URL is set to serve seller summaries
	pgURL := os.Getenv("POSTGRES_URL")
	var pgPool *pgxpool.Pool
	if pgURL != "" {
		cfg, err := pgxpool.ParseConfig(pgURL)
		if err != nil {
			log.Printf("failed parse postgres config: %v", err)
		} else {
			pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
			if err != nil {
				log.Printf("failed connect postgres: %v", err)
			} else {
				pgPool = pool
				log.Printf("Connected to Postgres for seller summaries")
			}
		}
	}

	// HTTP handler to fetch latest seller performance summary
	apiHandler := func(w http.ResponseWriter, r *http.Request) {
		sellerId := r.URL.Query().Get("sellerId")
		if sellerId == "" {
			http.Error(w, "sellerId query param required", http.StatusBadRequest)
			return
		}
		if pgPool == nil {
			http.Error(w, "Postgres not configured", http.StatusServiceUnavailable)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		row := pgPool.QueryRow(ctx, `SELECT id, ai_generated_summary, top_complaint_themes::text, sentiment_score, grandma_score, created_at, summary_period_start::text, summary_period_end::text FROM public.seller_performance_summaries WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1`, sellerId)

		var id string
		var aiSummary interface{}
		var topThemes interface{}
		var sentiment interface{}
		var grandma interface{}
		var createdAt interface{}
		var periodStart interface{}
		var periodEnd interface{}

		if err := row.Scan(&id, &aiSummary, &topThemes, &sentiment, &grandma, &createdAt, &periodStart, &periodEnd); err != nil {
			http.Error(w, fmt.Sprintf("query failed: %v", err), http.StatusInternalServerError)
			return
		}

		resp := map[string]interface{}{
			"id":                 id,
			"sellerId":           sellerId,
			"aiGeneratedSummary": nil,
			"topComplaintThemes": []string{},
			"sentimentScore":     nil,
			"grandmaScore":       nil,
			"createdAt":          nil,
			"summaryPeriodStart": nil,
			"summaryPeriodEnd":   nil,
		}

		if aiSummary != nil {
			switch v := aiSummary.(type) {
			case string:
				resp["aiGeneratedSummary"] = v
			case []byte:
				resp["aiGeneratedSummary"] = string(v)
			}
		}

		if topThemes != nil {
			switch v := topThemes.(type) {
			case string:
				var arr []string
				if err := json.Unmarshal([]byte(v), &arr); err == nil {
					resp["topComplaintThemes"] = arr
				} else {
					resp["topComplaintThemes"] = v
				}
			case []byte:
				var arr []string
				if err := json.Unmarshal(v, &arr); err == nil {
					resp["topComplaintThemes"] = arr
				} else {
					resp["topComplaintThemes"] = string(v)
				}
			}
		}

		if sentiment != nil {
			switch v := sentiment.(type) {
			case float32:
				resp["sentimentScore"] = float64(v)
			case float64:
				resp["sentimentScore"] = v
			case int64:
				resp["sentimentScore"] = float64(v)
			case []byte:
				// numeric can come as []byte containing textual number
				var f float64
				if err := json.Unmarshal(v, &f); err == nil {
					resp["sentimentScore"] = f
				}
			}
		}

		if grandma != nil {
			switch v := grandma.(type) {
			case int32:
				resp["grandmaScore"] = int(v)
			case int64:
				resp["grandmaScore"] = int(v)
			case float32:
				resp["grandmaScore"] = int(v)
			case float64:
				resp["grandmaScore"] = int(v)
			case []byte:
				resp["grandmaScore"] = string(v)
			}
		}

		if createdAt != nil {
			switch v := createdAt.(type) {
			case string:
				resp["createdAt"] = v
			case []byte:
				resp["createdAt"] = string(v)
			}
		}

		if periodStart != nil {
			switch v := periodStart.(type) {
			case string:
				resp["summaryPeriodStart"] = v
			case []byte:
				resp["summaryPeriodStart"] = string(v)
			}
		}

		if periodEnd != nil {
			switch v := periodEnd.(type) {
			case string:
				resp["summaryPeriodEnd"] = v
			case []byte:
				resp["summaryPeriodEnd"] = string(v)
			}
		}

		b, _ := json.Marshal(resp)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}

	// Optional simple API key middleware for basic auth
	apiKey := os.Getenv("API_KEY")
	apiKeyMiddleware := func(h http.HandlerFunc) http.HandlerFunc {
		if apiKey == "" {
			return h // no API_KEY configured -> no auth required
		}
		return func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("X-API-KEY")
			if key == "" {
				// try Bearer token
				auth := r.Header.Get("Authorization")
				if len(auth) > 7 && auth[:7] == "Bearer " {
					key = auth[7:]
				}
			}
			if key != apiKey {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			h(w, r)
		}
	}

	http.HandleFunc("/api/seller-summary", apiKeyMiddleware(apiHandler))

	go func() {
		log.Printf("Starting Go support HTTP server on :%s", port)
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatalf("server failed: %v", err)
		}
	}()

	// keep running (existing initialization can be added here)
	select {}
}
