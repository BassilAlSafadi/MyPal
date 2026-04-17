package redis

import "time"

// ShoppingCarts represents a user's cart state stored in Redis.
type ShoppingCarts struct {
	UserID    string           `json:"user_id"`
	Items     map[string]int32 `json:"items"` // product_id -> quantity
	UpdatedAt time.Time        `json:"updated_at"`
}
