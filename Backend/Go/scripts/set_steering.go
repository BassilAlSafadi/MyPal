package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func main() {
	// 1. Load .env from project root
	// Assuming script is run from Backend/Go
	err := godotenv.Load("../../.env")
	if err != nil {
		// Try current dir if not found
		godotenv.Load(".env")
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("REDIS_URL not found in environment")
	}

	// 2. Parse arguments: go run set_steering.go <userID> <key1> <val1> <key2> <val2>...
	args := os.Args[1:]
	if len(args) < 3 || (len(args)-1)%2 != 0 {
		fmt.Println("Usage: go run set_steering.go <userID> <factorKey> <weight> [<factorKey2> <weight2> ...]")
		fmt.Println("Example: go run set_steering.go BASIL_UUID gpu_weight 1.5 cpu_weight 0.8")
		return
	}

	userID := args[0]
	weights := make(map[string]interface{})
	for i := 1; i < len(args); i += 2 {
		key := args[i]
		val, err := strconv.ParseFloat(args[i+1], 64)
		if err != nil {
			log.Fatalf("Invalid weight value for %s: %s", key, args[i+1])
		}
		weights[key] = val
	}

	// 3. Connect to Redis
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Failed to parse REDIS_URL: %v", err)
	}

	rdb := redis.NewClient(opt)
	ctx := context.Background()

	// 4. Execute HSET
	redisKey := fmt.Sprintf("user_steering:%s", userID)
	err = rdb.HSet(ctx, redisKey, weights).Err()
	if err != nil {
		log.Fatalf("Failed to set Redis weights: %v", err)
	}

	fmt.Printf("Successfully updated weights for user %s in Redis:\n", userID)
	for k, v := range weights {
		fmt.Printf("  - %s: %v\n", k, v)
	}
}
