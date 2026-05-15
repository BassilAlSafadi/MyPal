package config

import (
	"os"
)

// Config holds all environment-based configuration for the Go services.
type Config struct {
	GoServerPort        string
	PostgresURL         string
	MongoURI            string
	RedisURL            string
	InternalServiceToken string
	APIKey              string
}

// LoadConfig retrieves configuration from environment variables with defaults.
func LoadConfig() *Config {
	return &Config{
		GoServerPort:         getEnv("GO_SERVER_PORT", "5001"),
		PostgresURL:          os.Getenv("POSTGRES_URL"),
		MongoURI:             os.Getenv("MONGO_URI"),
		RedisURL:             os.Getenv("REDIS_URL"),
		InternalServiceToken: os.Getenv("INTERNAL_SERVICE_TOKEN"),
		APIKey:               os.Getenv("API_KEY"),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
