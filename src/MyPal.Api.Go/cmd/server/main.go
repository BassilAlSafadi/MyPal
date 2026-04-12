package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	// Pull environment variables for Infisical deployment setup
	postgresURL := os.Getenv("POSTGRES_URL")
	redisHost := os.Getenv("REDIS_HOST")

	fmt.Printf("Starting Go Gateway with DB Setup: %v\n", postgresURL != "")
	fmt.Printf("Redis configured: %v\n", redisHost != "")

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Println("Listening on :8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
