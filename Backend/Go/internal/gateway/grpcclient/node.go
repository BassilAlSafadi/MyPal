package grpcclient

import "google.golang.org/grpc"

// Full gRPC method paths for the Node.js Orchestrator.
const (
	// AgentService
	AgentOrchestrate = "/mypal.AgentService/Orchestrate"

	// AiService
	AiDeepSearch         = "/mypal.AiService/DeepSearch"
	AiDeepSearchQuota    = "/mypal.AiService/GetDeepSearchQuota"
	AiFastSearch         = "/mypal.AiService/FastSearch"
	AiGlobalSearch       = "/mypal.AiService/GlobalSearch"
	AiGlobalSearchQuota  = "/mypal.AiService/GetGlobalSearchQuota"
	AiTranslate          = "/mypal.AiService/Translate"
	AiSummarize          = "/mypal.AiService/Summarize"
	AiProductAsk         = "/mypal.AiService/ProductAsk"
	AiCleanText          = "/mypal.AiService/CleanText"
	AiRecommend          = "/mypal.AiService/Recommend"
	AiGetRecommendations = "/mypal.AiService/GetRecommendations"

	// SellerService
	SellerAnalyze         = "/mypal.SellerService/AnalyzeSeller"
	SellerMapSummaries    = "/mypal.SellerService/MapSummaries"
	SellerReduceSummaries = "/mypal.SellerService/ReduceSummaries"
	SellerAnalyzeListing  = "/mypal.SellerService/AnalyzeListing"
	SellerGenerateReport  = "/mypal.SellerService/GenerateReport"
	SellerGetReport       = "/mypal.SellerService/GetSellerReport"

	// ChatService
	ChatCreate      = "/mypal.ChatService/CreateThread"
	ChatList        = "/mypal.ChatService/ListThreads"
	ChatGet         = "/mypal.ChatService/GetThread"
	ChatDelete      = "/mypal.ChatService/DeleteThread"
	ChatSendMessage = "/mypal.ChatService/SendMessage"

	// HistoryService
	HistoryGet = "/mypal.HistoryService/GetHistory"
)

// NodeConn holds the shared gRPC connection to the Node.js Orchestrator.
type NodeConn struct {
	conn          *grpc.ClientConn
	upstream      string
	internalToken string
}

// NewNodeConn wraps a gRPC connection to the Node.js Orchestrator.
func NewNodeConn(conn *grpc.ClientConn, internalToken string) *NodeConn {
	return &NodeConn{conn: conn, upstream: conn.Target(), internalToken: internalToken}
}

func (n *NodeConn) Conn() *grpc.ClientConn { return n.conn }
func (n *NodeConn) Upstream() string       { return n.upstream }
func (n *NodeConn) InternalToken() string  { return n.internalToken }
