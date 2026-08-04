// Package store is the messaging service's MongoDB persistence.
//
// It holds the three conversation stores the split brought together:
//   - chat threads, which the Node orchestrator kept in Postgres
//     (public.chat_threads, messages as a JSONB array);
//   - negotiation sessions, already Mongo-shaped in the Go support service;
//   - support tickets, previously Postgres rows in the C# monolith.
//
// The chat thread documents keep the `_id` field names the SPA already reads,
// so no frontend type changes were needed.
package store

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ErrNotFound is returned when a document does not exist or is not the caller's.
var ErrNotFound = errors.New("not found")

// ChatMessage is one turn in a persistent chat thread.
type ChatMessage struct {
	ID               string           `bson:"_id"                         json:"_id"`
	Role             string           `bson:"role"                        json:"role"`
	Content          string           `bson:"content"                     json:"content"`
	Status           string           `bson:"status,omitempty"            json:"status,omitempty"`
	Products         []any            `bson:"products,omitempty"          json:"products,omitempty"`
	InternalProducts []map[string]any `bson:"internal_products,omitempty" json:"internal_products,omitempty"`
	CreatedAt        time.Time        `bson:"created_at"                  json:"created_at"`
}

// ChatThread is a conversation. Messages are embedded, as they were in the
// Postgres JSONB column this replaced.
type ChatThread struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"_id"`
	UserID    string             `bson:"user_id"       json:"-"`
	Title     string             `bson:"title"         json:"title"`
	Messages  []ChatMessage      `bson:"messages"      json:"messages,omitempty"`
	CreatedAt time.Time          `bson:"created_at"    json:"created_at"`
	UpdatedAt time.Time          `bson:"updated_at"    json:"updated_at"`
}

// NegotiationMessage is one turn in a buyer/seller negotiation.
type NegotiationMessage struct {
	Role      string    `bson:"role"      json:"role"` // "buyer", "seller", "ai_broker"
	Content   string    `bson:"content"   json:"content"`
	Timestamp time.Time `bson:"timestamp" json:"timestamp"`
}

// NegotiationSession is a negotiation attached to a support ticket.
type NegotiationSession struct {
	ID        primitive.ObjectID   `bson:"_id,omitempty" json:"_id"`
	TicketID  string               `bson:"ticket_id"     json:"ticket_id"`
	Status    string               `bson:"status"        json:"status"` // "open", "settled"
	Messages  []NegotiationMessage `bson:"messages"      json:"messages"`
	UpdatedAt time.Time            `bson:"updated_at"    json:"updated_at"`
}

// SupportTicket is a user's support request.
//
// Moved from the C# monolith's public.support_tickets. user_id and product_id
// reference mypal_auth and mypal_listings, so they are plain ID strings here.
type SupportTicket struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"    json:"_id"`
	UserID    string             `bson:"user_id"          json:"user_id"`
	ProductID string             `bson:"product_id,omitempty" json:"product_id,omitempty"`
	Subject   string             `bson:"subject"          json:"subject"`
	Body      string             `bson:"body"             json:"body"`
	Status    string             `bson:"status"           json:"status"`   // open | in_progress | resolved | closed
	Priority  string             `bson:"priority"         json:"priority"` // low | medium | high | urgent
	CreatedAt time.Time          `bson:"created_at"       json:"created_at"`
	UpdatedAt time.Time          `bson:"updated_at"       json:"updated_at"`
}

// Store wraps the messaging service's Mongo collections.
type Store struct {
	threads      *mongo.Collection
	negotiations *mongo.Collection
	tickets      *mongo.Collection
}

// New connects to MongoDB. Unlike the AI service's store this one is required —
// messaging has no meaningful degraded mode, the conversations are the service.
func New(ctx context.Context, uri, dbName string) (*Store, error) {
	if uri == "" {
		return nil, errors.New("MONGO_URL is required for the messaging service")
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

	db := client.Database(dbName)
	s := &Store{
		threads:      db.Collection("chat_threads"),
		negotiations: db.Collection("negotiation_sessions"),
		tickets:      db.Collection("support_tickets"),
	}
	s.ensureIndexes(ctx)
	return s, nil
}

func (s *Store) ensureIndexes(ctx context.Context) {
	// Best-effort: an index failure must not stop the service starting.
	_, _ = s.threads.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "updated_at", Value: -1}}},
	})
	_, _ = s.negotiations.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "ticket_id", Value: 1}}},
	})
	_, _ = s.tickets.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}}},
	})
}

// ─── Chat threads ─────────────────────────────────────────────────────────────

// CreateThread starts an empty thread for a user.
func (s *Store) CreateThread(ctx context.Context, userID string) (*ChatThread, error) {
	now := time.Now().UTC()
	thread := &ChatThread{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		Title:     "New chat",
		Messages:  []ChatMessage{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := s.threads.InsertOne(ctx, thread); err != nil {
		return nil, err
	}
	return thread, nil
}

// ListThreads returns a user's threads, most recent first, without messages.
func (s *Store) ListThreads(ctx context.Context, userID string) ([]ChatThread, error) {
	cursor, err := s.threads.Find(ctx,
		bson.M{"user_id": userID},
		options.Find().
			SetSort(bson.D{{Key: "updated_at", Value: -1}}).
			SetLimit(50).
			SetProjection(bson.M{"messages": 0}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	threads := []ChatThread{}
	if err := cursor.All(ctx, &threads); err != nil {
		return nil, err
	}
	return threads, nil
}

// GetThread returns one thread with all messages, scoped to its owner.
func (s *Store) GetThread(ctx context.Context, userID, threadID string) (*ChatThread, error) {
	oid, err := primitive.ObjectIDFromHex(threadID)
	if err != nil {
		return nil, ErrNotFound
	}

	var thread ChatThread
	err = s.threads.FindOne(ctx, bson.M{"_id": oid, "user_id": userID}).Decode(&thread)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &thread, nil
}

// DeleteThread removes a thread. Deleting something that is not there is not an error.
func (s *Store) DeleteThread(ctx context.Context, userID, threadID string) error {
	oid, err := primitive.ObjectIDFromHex(threadID)
	if err != nil {
		return nil
	}
	_, err = s.threads.DeleteOne(ctx, bson.M{"_id": oid, "user_id": userID})
	return err
}

// AppendMessages adds turns to a thread and updates its title and timestamp.
func (s *Store) AppendMessages(ctx context.Context, userID, threadID, title string, messages ...ChatMessage) error {
	oid, err := primitive.ObjectIDFromHex(threadID)
	if err != nil {
		return ErrNotFound
	}

	update := bson.M{
		"$push": bson.M{"messages": bson.M{"$each": messages}},
		"$set":  bson.M{"title": title, "updated_at": time.Now().UTC()},
	}

	result, err := s.threads.UpdateOne(ctx, bson.M{"_id": oid, "user_id": userID}, update)
	if err != nil {
		return err
	}
	if result.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// ─── Negotiations ─────────────────────────────────────────────────────────────

// NegotiationByTicket returns the negotiation attached to a ticket.
func (s *Store) NegotiationByTicket(ctx context.Context, ticketID string) (*NegotiationSession, error) {
	var session NegotiationSession
	err := s.negotiations.FindOne(ctx, bson.M{"ticket_id": ticketID}).Decode(&session)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

// AppendNegotiationMessage adds a turn, opening the session if it is new.
func (s *Store) AppendNegotiationMessage(ctx context.Context, ticketID string, message NegotiationMessage) error {
	now := time.Now().UTC()
	if message.Timestamp.IsZero() {
		message.Timestamp = now
	}

	_, err := s.negotiations.UpdateOne(ctx,
		bson.M{"ticket_id": ticketID},
		bson.M{
			"$push":        bson.M{"messages": message},
			"$set":         bson.M{"updated_at": now},
			"$setOnInsert": bson.M{"ticket_id": ticketID, "status": "open"},
		},
		options.Update().SetUpsert(true))
	return err
}

// SetNegotiationStatus moves a session between "open" and "settled".
func (s *Store) SetNegotiationStatus(ctx context.Context, ticketID, status string) error {
	result, err := s.negotiations.UpdateOne(ctx,
		bson.M{"ticket_id": ticketID},
		bson.M{"$set": bson.M{"status": status, "updated_at": time.Now().UTC()}})
	if err != nil {
		return err
	}
	if result.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// ─── Support tickets ──────────────────────────────────────────────────────────

// CreateTicket opens a support ticket.
func (s *Store) CreateTicket(ctx context.Context, ticket SupportTicket) (*SupportTicket, error) {
	now := time.Now().UTC()
	ticket.ID = primitive.NewObjectID()
	ticket.CreatedAt = now
	ticket.UpdatedAt = now
	if ticket.Status == "" {
		ticket.Status = "open"
	}
	if ticket.Priority == "" {
		ticket.Priority = "medium"
	}

	if _, err := s.tickets.InsertOne(ctx, ticket); err != nil {
		return nil, err
	}
	return &ticket, nil
}

// ListTickets returns a user's tickets, newest first.
func (s *Store) ListTickets(ctx context.Context, userID string) ([]SupportTicket, error) {
	cursor, err := s.tickets.Find(ctx,
		bson.M{"user_id": userID},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(50))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	tickets := []SupportTicket{}
	if err := cursor.All(ctx, &tickets); err != nil {
		return nil, err
	}
	return tickets, nil
}

// GetTicket returns one ticket, scoped to its owner.
func (s *Store) GetTicket(ctx context.Context, userID, ticketID string) (*SupportTicket, error) {
	oid, err := primitive.ObjectIDFromHex(ticketID)
	if err != nil {
		return nil, ErrNotFound
	}

	var ticket SupportTicket
	err = s.tickets.FindOne(ctx, bson.M{"_id": oid, "user_id": userID}).Decode(&ticket)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

// UpdateTicketStatus moves a ticket through its lifecycle.
func (s *Store) UpdateTicketStatus(ctx context.Context, userID, ticketID, status string) error {
	oid, err := primitive.ObjectIDFromHex(ticketID)
	if err != nil {
		return ErrNotFound
	}

	result, err := s.tickets.UpdateOne(ctx,
		bson.M{"_id": oid, "user_id": userID},
		bson.M{"$set": bson.M{"status": status, "updated_at": time.Now().UTC()}})
	if err != nil {
		return err
	}
	if result.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}
