package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/mongo"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"

	"mypal/api/go/internal/models"
	"mypal/api/go/internal/security"
)

func seedMongo(db *mongo.Database) {
	coll := db.Collection("negotiation_sessions")

	sessions := []interface{}{
		models.NegotiationSession{
			TicketID: "TKT-1001",
			Status:   "open",
			Messages: []models.Message{
				{Role: "buyer", Content: "Hey, can I see more photos of the GPU?", Timestamp: time.Now()},
				{Role: "seller", Content: "Sure, check the MyPal product media gallery.", Timestamp: time.Now().Add(time.Minute * 2)},
			},
			UpdatedAt: time.Now(),
		},
	}
	coll.InsertMany(context.TODO(), sessions)
}

// ── gRPC SupportService implementation ───────────────────────────────────────

// supportGRPCServer implements the SupportService gRPC server defined in mypal.proto.
// It re-uses existing business logic directly instead of self-calling.
type supportGRPCServer struct {
	pgPool *pgxpool.Pool
	apiKey string
}

// ValidateSSQL runs the SSQL safety check and returns the result.
func (s *supportGRPCServer) ValidateSSQL(ctx context.Context, req *structpb.Struct) (*structpb.Struct, error) {
	m := req.AsMap()
	q := ""
	if qMap, ok := m["query"].(map[string]interface{}); ok {
		// Gateway puts URL query params in the "query" sub-map; both "q" and "ssql" keys are accepted.
		if v, _ := qMap["ssql"].(string); v != "" {
			q = v
		} else if v, _ := qMap["q"].(string); v != "" {
			q = v
		}
	}

	safe := security.IsQuerySafe(q)
	errMsg := ""
	if !safe {
		errMsg = "query contains potentially unsafe patterns"
	}

	resp, _ := structpb.NewStruct(map[string]interface{}{
		"status": float64(200),
		"body": map[string]interface{}{
			"valid": safe,
			"error": errMsg,
		},
	})
	return resp, nil
}

// GetSellerSummary queries Postgres for the latest seller performance summary.
func (s *supportGRPCServer) GetSellerSummary(ctx context.Context, req *structpb.Struct) (*structpb.Struct, error) {
	m := req.AsMap()
	sellerID := ""
	if qMap, ok := m["query"].(map[string]interface{}); ok {
		sellerID, _ = qMap["sellerId"].(string)
	}
	if sellerID == "" {
		if pMap, ok := m["params"].(map[string]interface{}); ok {
			sellerID, _ = pMap["sellerId"].(string)
		}
	}

	if sellerID == "" {
		return nil, grpcstatus.Error(codes.InvalidArgument, "sellerId is required")
	}
	if s.pgPool == nil {
		return nil, grpcstatus.Error(codes.Unavailable, "Postgres not configured")
	}

	qCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	row := s.pgPool.QueryRow(qCtx,
		`SELECT id, ai_generated_summary, top_complaint_themes::text, sentiment_score, grandma_score,
		        created_at, summary_period_start::text, summary_period_end::text
		   FROM public.seller_performance_summaries
		  WHERE seller_id = $1
		  ORDER BY created_at DESC LIMIT 1`, sellerID)

	var (
		id, aiSummary, topThemes, createdAt, periodStart, periodEnd interface{}
		sentiment, grandma                                           interface{}
	)
	if err := row.Scan(&id, &aiSummary, &topThemes, &sentiment, &grandma, &createdAt, &periodStart, &periodEnd); err != nil {
		return nil, grpcstatus.Errorf(codes.Internal, "query failed: %v", err)
	}

	body := map[string]interface{}{
		"id":                 fmt.Sprint(id),
		"sellerId":           sellerID,
		"aiGeneratedSummary": stringify(aiSummary),
		"topComplaintThemes": parseJSONArray(topThemes),
		"sentimentScore":     toFloat(sentiment),
		"grandmaScore":       toInt(grandma),
		"createdAt":          stringify(createdAt),
		"summaryPeriodStart": stringify(periodStart),
		"summaryPeriodEnd":   stringify(periodEnd),
	}

	resp, err := structpb.NewStruct(map[string]interface{}{
		"status": float64(200),
		"body":   body,
	})
	if err != nil {
		return nil, grpcstatus.Errorf(codes.Internal, "marshal response: %v", err)
	}
	return resp, nil
}

// ── Helper conversions ────────────────────────────────────────────────────────

func stringify(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case string:
		return t
	case []byte:
		return string(t)
	default:
		return fmt.Sprint(t)
	}
}

func parseJSONArray(v interface{}) interface{} {
	var raw []byte
	switch t := v.(type) {
	case string:
		raw = []byte(t)
	case []byte:
		raw = t
	default:
		return []string{}
	}
	var arr []string
	if json.Unmarshal(raw, &arr) == nil {
		return arr
	}
	return []string{}
}

func toFloat(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case float32:
		return float64(t)
	case float64:
		return t
	case int64:
		return float64(t)
	case []byte:
		var f float64
		if json.Unmarshal(t, &f) == nil {
			return f
		}
	}
	return nil
}

func toInt(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case int32:
		return int(t)
	case int64:
		return int(t)
	case float32:
		return int(t)
	case float64:
		return int(t)
	}
	return nil
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	fmt.Println("MyPal Support Go Service Starting...")

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = os.Getenv("GO_SERVER_PORT")
	}
	if httpPort == "" {
		httpPort = "5001"
	}

	grpcPort := os.Getenv("SUPPORT_GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "5011"
	}

	apiKey := os.Getenv("API_KEY")

	// Optional Postgres connection for seller summary queries.
	var pgPool *pgxpool.Pool
	if pgURL := os.Getenv("POSTGRES_URL"); pgURL != "" {
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

	// ── HTTP server (health + legacy REST) ───────────────────────────────────
	apiKeyMiddleware := func(h http.HandlerFunc) http.HandlerFunc {
		if apiKey == "" {
			return h
		}
		return func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("X-API-KEY")
			if key == "" {
				key = r.Header.Get("X-Internal-Token")
			}
			if key == "" {
				if auth := r.Header.Get("Authorization"); len(auth) > 7 && auth[:7] == "Bearer " {
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

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	http.HandleFunc("/validate-ssql", security.ValidateHandler)

	http.HandleFunc("/api/seller-summary", apiKeyMiddleware(func(w http.ResponseWriter, r *http.Request) {
		sellerID := r.URL.Query().Get("sellerId")
		if sellerID == "" {
			http.Error(w, "sellerId query param required", http.StatusBadRequest)
			return
		}
		if pgPool == nil {
			http.Error(w, "Postgres not configured", http.StatusServiceUnavailable)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		row := pgPool.QueryRow(ctx,
			`SELECT id, ai_generated_summary, top_complaint_themes::text, sentiment_score, grandma_score,
			        created_at, summary_period_start::text, summary_period_end::text
			   FROM public.seller_performance_summaries
			  WHERE seller_id = $1
			  ORDER BY created_at DESC LIMIT 1`, sellerID)

		var id, aiSummary, topThemes, sentiment, grandma, createdAt, periodStart, periodEnd interface{}
		if err := row.Scan(&id, &aiSummary, &topThemes, &sentiment, &grandma, &createdAt, &periodStart, &periodEnd); err != nil {
			http.Error(w, fmt.Sprintf("query failed: %v", err), http.StatusInternalServerError)
			return
		}

		resp := map[string]interface{}{
			"id":                 fmt.Sprint(id),
			"sellerId":           sellerID,
			"aiGeneratedSummary": stringify(aiSummary),
			"topComplaintThemes": parseJSONArray(topThemes),
			"sentimentScore":     toFloat(sentiment),
			"grandmaScore":       toInt(grandma),
			"createdAt":          stringify(createdAt),
			"summaryPeriodStart": stringify(periodStart),
			"summaryPeriodEnd":   stringify(periodEnd),
		}
		b, _ := json.Marshal(resp)
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	}))

	go func() {
		log.Printf("Support HTTP server on :%s", httpPort)
		if err := http.ListenAndServe(":"+httpPort, nil); err != nil {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	// ── gRPC server ───────────────────────────────────────────────────────────
	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("failed to listen on :%s: %v", grpcPort, err)
	}

	grpcSrv := grpc.NewServer()

	// Register SupportService using the raw method registration approach.
	// We avoid importing the generated proto package by registering directly.
	svcImpl := &supportGRPCServer{pgPool: pgPool, apiKey: apiKey}
	registerSupportService(grpcSrv, svcImpl)

	log.Printf("Support gRPC server on :%s", grpcPort)
	if err := grpcSrv.Serve(lis); err != nil {
		log.Fatalf("gRPC server failed: %v", err)
	}
}

// registerSupportService manually registers the SupportService gRPC methods.
// This avoids needing proto-generated code in the support binary.
func registerSupportService(s *grpc.Server, impl *supportGRPCServer) {
	desc := &grpc.ServiceDesc{
		ServiceName: "mypal.SupportService",
		HandlerType: (*supportServiceServer)(nil),
		Methods: []grpc.MethodDesc{
			{
				MethodName: "ValidateSSQL",
				Handler:    validateSSSQLHandler,
			},
			{
				MethodName: "GetSellerSummary",
				Handler:    getSellerSummaryHandler,
			},
		},
		Streams: []grpc.StreamDesc{},
	}
	s.RegisterService(desc, impl)
}

type supportServiceServer interface {
	ValidateSSQL(context.Context, *structpb.Struct) (*structpb.Struct, error)
	GetSellerSummary(context.Context, *structpb.Struct) (*structpb.Struct, error)
}

func validateSSSQLHandler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(structpb.Struct)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(supportServiceServer).ValidateSSQL(ctx, req)
}

func getSellerSummaryHandler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(structpb.Struct)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(supportServiceServer).GetSellerSummary(ctx, req)
}
