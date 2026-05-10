package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func RedisUtil(args []string) error {
	// 1) Load env
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load(".env")

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		return fmt.Errorf("REDIS_URL not found in environment")
	}

	if len(args) < 2 {
		return fmt.Errorf("Usage: go run redis_util.go <COMMAND> <KEY> <ARGS...>\nSupported: SET, HSET, GET, DEL")
	}

	cmd := strings.ToUpper(args[0])
	key := args[1]

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return fmt.Errorf("failed to parse REDIS_URL: %w", err)
	}

	rdb := redis.NewClient(opt)
	ctx := context.Background()

	switch cmd {
	case "SET":
		if len(args) < 3 {
			return fmt.Errorf("SET requires key and value")
		}
		val := args[2]

		var expiration time.Duration
		// Handle EX <seconds>
		for i := 3; i < len(args); i++ {
			if strings.ToUpper(args[i]) == "EX" && i+1 < len(args) {
				seconds, convErr := strconv.Atoi(args[i+1])
				if convErr != nil {
					return fmt.Errorf("invalid EX seconds: %w", convErr)
				}
				expiration = time.Duration(seconds) * time.Second
				break
			}
		}

		if err := rdb.Set(ctx, key, val, expiration).Err(); err != nil {
			return err
		}
		fmt.Printf("OK: SET %s = %s (Expiry: %v)\n", key, val, expiration)
		return nil

	case "HSET":
		if len(args) < 4 || (len(args)-2)%2 != 0 {
			return fmt.Errorf("HSET requires key and field-value pairs")
		}

		fields := make(map[string]interface{})
		for i := 2; i < len(args); i += 2 {
			fields[args[i]] = args[i+1]
		}

		if err := rdb.HSet(ctx, key, fields).Err(); err != nil {
			return err
		}
		fmt.Printf("OK: HSET %s updated\n", key)
		return nil

	case "GET":
		val, err := rdb.Get(ctx, key).Result()
		if err == nil {
			fmt.Println(val)
			return nil
		}
		if err == redis.Nil {
			fmt.Println("(nil)")
			return nil
		}
		return err

	case "DEL":
		n, err := rdb.Del(ctx, key).Result()
		if err != nil {
			return err
		}
		fmt.Printf("OK: DEL %s (deleted %d)\n", key, n)
		return nil

	default:
		return fmt.Errorf("Unsupported command: %s", cmd)
	}
}
