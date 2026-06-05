package grpcclient

import "google.golang.org/grpc"

// Full gRPC method paths for the Go Support Service.
const (
	SupportValidateSSQL    = "/mypal.SupportService/ValidateSSQL"
	SupportGetSellerSummary = "/mypal.SupportService/GetSellerSummary"
)

// SupportConn holds the shared gRPC connection to the Go Support Service.
type SupportConn struct {
	conn          *grpc.ClientConn
	upstream      string
	internalToken string
}

// NewSupportConn wraps a gRPC connection to the Go Support Service.
func NewSupportConn(conn *grpc.ClientConn, internalToken string) *SupportConn {
	return &SupportConn{conn: conn, upstream: conn.Target(), internalToken: internalToken}
}

func (s *SupportConn) Conn() *grpc.ClientConn { return s.conn }
func (s *SupportConn) Upstream() string       { return s.upstream }
func (s *SupportConn) InternalToken() string  { return s.internalToken }
