package redis

import (
	"context"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"
)

type SteeringRepository interface {
	SetSteering(ctx context.Context, userID string, weights map[string]float64) error
	GetSteering(ctx context.Context, userID string) (map[string]float64, error)
	DeleteSteering(ctx context.Context, userID string) error
}

type steeringRepository struct {
	client *redis.Client
}

func NewSteeringRepository(client *redis.Client) SteeringRepository {
	return &steeringRepository{client: client}
}

func (r *steeringRepository) SetSteering(ctx context.Context, userID string, weights map[string]float64) error {
	key := fmt.Sprintf("user_steering:%s", userID)
	
	// Convert weights to map[string]interface{} for HSet
	fields := make(map[string]interface{})
	for k, v := range weights {
		fields[k] = v
	}

	err := r.client.HSet(ctx, key, fields).Err()
	if err != nil {
		return fmt.Errorf("redis.SetSteering: %w", err)
	}
	return nil
}

func (r *steeringRepository) GetSteering(ctx context.Context, userID string) (map[string]float64, error) {
	key := fmt.Sprintf("user_steering:%s", userID)
	
	res, err := r.client.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("redis.GetSteering: %w", err)
	}

	weights := make(map[string]float64)
	for k, v := range res {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			continue // or log error
		}
		weights[k] = f
	}
	return weights, nil
}

func (r *steeringRepository) DeleteSteering(ctx context.Context, userID string) error {
	key := fmt.Sprintf("user_steering:%s", userID)
	return r.client.Del(ctx, key).Err()
}
