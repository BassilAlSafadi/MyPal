package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"mypal/api/go/internal/repository/postgres"
)

const (
	// MongoDB collection for cold audit traces (Atlas).
	lifeTrackAuditCollection = "life_track_audit"
	// Redis key prefix for hot narrative cache (Upstash).
	redisHotNarrativeKeyPrefix = "narrative:life_track:hot:"
)

// LifeTrackSyncDeps holds the three polyglot stores used by CommitNarrativeLifeTrack.
type LifeTrackSyncDeps struct {
	PG    *pgxpool.Pool
	Redis redis.Cmdable
	Mongo *mongo.Database
}

// NarrativeLifeTrackInput is the business payload for a single narrative commit.
type NarrativeLifeTrackInput struct {
	UserID         string
	FinalStory     string
	StoryEmbedding []float32
	// HotStateJSON is serialized hot narrative state (Redis).
	HotStateJSON []byte
	// ColdAudit is merged into the MongoDB audit document (hashes, triggers, model refs).
	ColdAudit bson.M
}

// CommitNarrativeLifeTrack writes hot state to Redis, a cold audit trace to MongoDB,
// then commits the canonical story and vector to Postgres inside a transaction.
//
// If the Postgres commit fails after Redis and/or Mongo succeeded, earlier writes are
// compensated best-effort so the three stores do not diverge on failure paths.
func CommitNarrativeLifeTrack(ctx context.Context, deps *LifeTrackSyncDeps, in *NarrativeLifeTrackInput) error {
	if deps == nil || deps.PG == nil || deps.Redis == nil || deps.Mongo == nil {
		return fmt.Errorf("CommitNarrativeLifeTrack: incomplete deps")
	}
	if in == nil {
		return fmt.Errorf("CommitNarrativeLifeTrack: nil input")
	}
	if len(in.StoryEmbedding) != postgres.StoryEmbeddingDimensions {
		return fmt.Errorf("CommitNarrativeLifeTrack: embedding must be %d floats", postgres.StoryEmbeddingDimensions)
	}

	var corrBuf [16]byte
	if _, err := rand.Read(corrBuf[:]); err != nil {
		return fmt.Errorf("CommitNarrativeLifeTrack: correlation id: %w", err)
	}
	correlationID := hex.EncodeToString(corrBuf[:])
	hotKey := redisHotNarrativeKeyPrefix + in.UserID

	var mongoInsertedID interface{}
	redisWritten := false

	compensate := func() {
		if mongoInsertedID != nil {
			_, _ = deps.Mongo.Collection(lifeTrackAuditCollection).DeleteOne(ctx, bson.M{"_id": mongoInsertedID})
		}
		if redisWritten {
			_ = deps.Redis.Del(ctx, hotKey).Err()
		}
	}

	// 1) Hot path — Redis
	if err := deps.Redis.Set(ctx, hotKey, in.HotStateJSON, 0).Err(); err != nil {
		return fmt.Errorf("CommitNarrativeLifeTrack: redis set: %w", err)
	}
	redisWritten = true

	// 2) Cold path — MongoDB audit
	auditDoc := bson.M{
		"correlation_id": correlationID,
		"user_id":        in.UserID,
		"created_at":     time.Now().UTC(),
	}
	for k, v := range in.ColdAudit {
		auditDoc[k] = v
	}
	res, err := deps.Mongo.Collection(lifeTrackAuditCollection).InsertOne(ctx, auditDoc)
	if err != nil {
		compensate()
		return fmt.Errorf("CommitNarrativeLifeTrack: mongo insert: %w", err)
	}
	mongoInsertedID = res.InsertedID

	// 3) System of record — Postgres (transactional)
	tx, err := deps.PG.Begin(ctx)
	if err != nil {
		compensate()
		return fmt.Errorf("CommitNarrativeLifeTrack: pg begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	vec := pgvector.NewVector(in.StoryEmbedding)
	if err := postgres.UpdateUserLifeTrack(ctx, tx, in.UserID, in.FinalStory, vec); err != nil {
		compensate()
		return fmt.Errorf("CommitNarrativeLifeTrack: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		compensate()
		return fmt.Errorf("CommitNarrativeLifeTrack: pg commit: %w", err)
	}

	return nil
}
