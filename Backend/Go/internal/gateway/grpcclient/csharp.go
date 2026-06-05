package grpcclient

import "google.golang.org/grpc"

// Full gRPC method paths for the C# Main API.
// These must match the service and RPC names declared in mypal.proto.
const (
	// AuthService
	AuthLogin            = "/mypal.AuthService/Login"
	AuthSignup           = "/mypal.AuthService/Signup"
	AuthRefresh          = "/mypal.AuthService/Refresh"
	AuthLogout           = "/mypal.AuthService/Logout"
	AuthBootstrapSession = "/mypal.AuthService/BootstrapSession"

	// UserService
	UserGetMe         = "/mypal.UserService/GetMe"
	UserUpdateMe      = "/mypal.UserService/UpdateMe"
	UserUpdateLocation = "/mypal.UserService/UpdateLocation"

	// ProductService
	ProductList   = "/mypal.ProductService/ListProducts"
	ProductGet    = "/mypal.ProductService/GetProduct"
	ProductCreate = "/mypal.ProductService/CreateProduct"
	ProductUpdate = "/mypal.ProductService/UpdateProduct"
	ProductDelete = "/mypal.ProductService/DeleteProduct"

	// OrderService
	OrderList   = "/mypal.OrderService/ListOrders"
	OrderGet    = "/mypal.OrderService/GetOrder"
	OrderCreate = "/mypal.OrderService/CreateOrder"

	// CartService
	CartGet        = "/mypal.CartService/GetCart"
	CartAddItem    = "/mypal.CartService/AddItem"
	CartRemoveItem = "/mypal.CartService/RemoveItem"

	// WalletService
	WalletGet          = "/mypal.WalletService/GetWallet"
	WalletTransactions = "/mypal.WalletService/ListTransactions"
	WalletDeposit      = "/mypal.WalletService/Deposit"
	WalletWithdraw     = "/mypal.WalletService/Withdraw"

	// WishlistService
	WishlistGet    = "/mypal.WishlistService/GetWishlist"
	WishlistAdd    = "/mypal.WishlistService/AddItem"
	WishlistRemove = "/mypal.WishlistService/RemoveItem"

	// NotificationService
	NotifGet      = "/mypal.NotificationService/GetNotifications"
	NotifMarkRead = "/mypal.NotificationService/MarkRead"

	// ListingService
	ListingGet = "/mypal.ListingService/GetListings"
)

// CSharpConn holds the single shared gRPC connection to the C# Main API.
type CSharpConn struct {
	conn          *grpc.ClientConn
	upstream      string
	internalToken string
}

// NewCSharpConn wraps an existing gRPC connection with the upstream label and
// internal token needed by every handler.
func NewCSharpConn(conn *grpc.ClientConn, internalToken string) *CSharpConn {
	return &CSharpConn{conn: conn, upstream: conn.Target(), internalToken: internalToken}
}

// Conn returns the underlying gRPC connection so routes.go can call Handler()
// directly, keeping the routing file as readable as possible.
func (c *CSharpConn) Conn() *grpc.ClientConn { return c.conn }
func (c *CSharpConn) Upstream() string       { return c.upstream }
func (c *CSharpConn) InternalToken() string  { return c.internalToken }
