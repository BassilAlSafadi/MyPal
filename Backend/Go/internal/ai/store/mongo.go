// Package store is the AI service's MongoDB persistence.
//
// Port of Backend/Node/models.js, plus the tables the Node service kept in
// Postgres that are AI-owned state: the per-user search log and the AI
// feature history. The architecture puts the ai service on MongoDB, and
// neither is referenced by any other service, so they moved here rather
// than into one of the Postgres databases.
package store

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// AgentExecutionTrace records one orchestration run.
type AgentExecutionTrace struct {
	TraceID        string    `bson:"trace_id"`
	Workflow       string    `bson:"workflow"`
	Provider       string    `bson:"provider"`
	Model          string    `bson:"model"`
	LatencyMs      int64     `bson:"latency_ms"`
	Status         string    `bson:"status"`
	ReasoningSteps any       `bson:"reasoning_steps"`
	CreatedAt      time.Time `bson:"created_at"`
}

// AgenticValidationLog records one listing validation.
type AgenticValidationLog struct {
	TraceID          string    `bson:"trace_id"`
	EntityID         string    `bson:"entity_id"`
	EntityType       string    `bson:"entity_type"`
	ValidationResult bool      `bson:"validation_result"`
	Notes            string    `bson:"notes"`
	CreatedAt        time.Time `bson:"created_at"`
}

// FeatureHistoryEntry is one AI-feature call, as returned to the client.
type FeatureHistoryEntry struct {
	ID        string    `bson:"_id"        json:"_id"`
	Feature   string    `bson:"feature"    json:"feature"`
	Input     any       `bson:"input"      json:"input"`
	Output    string    `bson:"output"     json:"output"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// Store wraps the AI service's Mongo collections.
type Store struct {
	db *mongo.Database
}

// New connects to MongoDB. A nil Store is valid and disables persistence, which
// matches the Node service's behaviour with no MONGO_URL configured: audit
// writes fail instantly rather than hanging, and requests still succeed.
func New(ctx context.Context, uri, dbName string) (*Store, error) {
	if uri == "" {
		return nil, nil
	}

	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(connectCtx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(connectCtx, nil); err != nil {
		return nil, err
	}

	s := &Store{db: client.Database(dbName)}
	s.ensureIndexes(ctx)
	return s, nil
}

func (s *Store) ensureIndexes(ctx context.Context) {
	if s == nil {
		return
	}

	indexes := map[string][]mongo.IndexModel{
		"agent_execution_traces":  {{Keys: bson.D{{Key: "trace_id", Value: 1}}}},
		"agentic_validation_logs": {{Keys: bson.D{{Key: "trace_id", Value: 1}}}},
		"user_searches": {
			{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}}},
		},
		"ai_feature_history": {
			{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "feature", Value: 1}, {Key: "created_at", Value: -1}}},
		},
	}

	for collection, models := range indexes {
		// Index creation is best-effort: a failure here must not stop the service.
		_, _ = s.db.Collection(collection).Indexes().CreateMany(ctx, models)
	}
}

// SaveAgentTrace persists one orchestration trace. Best-effort.
func (s *Store) SaveAgentTrace(ctx context.Context, trace AgentExecutionTrace) error {
	if s == nil {
		return nil
	}
	trace.CreatedAt = time.Now().UTC()
	_, err := s.db.Collection("agent_execution_traces").InsertOne(ctx, trace)
	return err
}

// SaveValidationLog persists one listing validation. Best-effort.
func (s *Store) SaveValidationLog(ctx context.Context, log AgenticValidationLog) error {
	if s == nil {
		return nil
	}
	log.CreatedAt = time.Now().UTC()
	_, err := s.db.Collection("agentic_validation_logs").InsertOne(ctx, log)
	return err
}

// LogSearch records a search query for recommendation personalization.
// Keeps only the 50 most recent queries per user (rolling window).
// Non-blocking, non-fatal — personalization is best-effort.
func (s *Store) LogSearch(ctx context.Context, userID, query string) {
	if s == nil || userID == "" {
		return
	}
	trimmed := trimTo(query, 500)
	if trimmed == "" {
		return
	}

	coll := s.db.Collection("user_searches")
	if _, err := coll.InsertOne(ctx, bson.M{
		"user_id":    userID,
		"query":      trimmed,
		"created_at": time.Now().UTC(),
	}); err != nil {
		return
	}

	s.trimToMostRecent(ctx, coll, bson.M{"user_id": userID}, 50)
}

// RecentSearches returns the user's most recent queries, newest first.
func (s *Store) RecentSearches(ctx context.Context, userID string, limit int) []string {
	if s == nil || userID == "" {
		return nil
	}

	cursor, err := s.db.Collection("user_searches").Find(ctx,
		bson.M{"user_id": userID},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(int64(limit)))
	if err != nil {
		return nil
	}
	defer cursor.Close(ctx)

	var rows []struct {
		Query string `bson:"query"`
	}
	if cursor.All(ctx, &rows) != nil {
		return nil
	}

	queries := make([]string, 0, len(rows))
	for _, r := range rows {
		queries = append(queries, r.Query)
	}
	return queries
}

// SaveFeatureHistory persists one AI-feature call, keeping only the 20 most
// recent per (user, feature). Non-blocking, best-effort.
func (s *Store) SaveFeatureHistory(ctx context.Context, userID, feature string, input any, output string) {
	if s == nil || userID == "" || output == "" {
		return
	}

	coll := s.db.Collection("ai_feature_history")
	if _, err := coll.InsertOne(ctx, bson.M{
		"user_id":    userID,
		"feature":    feature,
		"input":      input,
		"output":     output,
		"created_at": time.Now().UTC(),
	}); err != nil {
		return
	}

	s.trimToMostRecent(ctx, coll, bson.M{"user_id": userID, "feature": feature}, 20)
}

// FeatureHistory returns the 20 most recent calls for one feature.
func (s *Store) FeatureHistory(ctx context.Context, userID, feature string) []FeatureHistoryEntry {
	if s == nil || userID == "" {
		return []FeatureHistoryEntry{}
	}

	cursor, err := s.db.Collection("ai_feature_history").Find(ctx,
		bson.M{"user_id": userID, "feature": feature},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(20))
	if err != nil {
		return []FeatureHistoryEntry{}
	}
	defer cursor.Close(ctx)

	var raw []bson.M
	if cursor.All(ctx, &raw) != nil {
		return []FeatureHistoryEntry{}
	}

	entries := make([]FeatureHistoryEntry, 0, len(raw))
	for _, row := range raw {
		entry := FeatureHistoryEntry{
			Feature: asString(row["feature"]),
			Input:   row["input"],
			Output:  asString(row["output"]),
		}
		if oid, ok := row["_id"].(interface{ Hex() string }); ok {
			entry.ID = oid.Hex()
		}
		if t, ok := row["created_at"].(interface{ Time() time.Time }); ok {
			entry.CreatedAt = t.Time()
		}
		entries = append(entries, entry)
	}
	return entries
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// trimToMostRecent deletes everything but the `keep` newest documents matching filter.
func (s *Store) trimToMostRecent(ctx context.Context, coll *mongo.Collection, filter bson.M, keep int) {
	cursor, err := coll.Find(ctx, filter,
		options.Find().
			SetSort(bson.D{{Key: "created_at", Value: -1}}).
			SetSkip(int64(keep)).
			SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return
	}
	defer cursor.Close(ctx)

	var stale []bson.M
	if cursor.All(ctx, &stale) != nil || len(stale) == 0 {
		return
	}

	ids := make([]any, 0, len(stale))
	for _, row := range stale {
		ids = append(ids, row["_id"])
	}
	_, _ = coll.DeleteMany(ctx, bson.M{"_id": bson.M{"$in": ids}})
}

func trimTo(s string, max int) string {
	trimmed := trimSpace(s)
	if len(trimmed) > max {
		return trimmed[:max]
	}
	return trimmed
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && isSpace(s[start]) {
		start++
	}
	for end > start && isSpace(s[end-1]) {
		end--
	}
	return s[start:end]
}

func isSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}
