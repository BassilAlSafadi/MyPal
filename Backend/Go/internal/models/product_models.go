package models

import "time"

// Product represents a row in the public.mypal_products table.
//
// Authenticity flow:
//
//	When a product is first registered its AuthenticityStatus is "pending".
//	After AI / supply-chain verification, UpdateAuthenticity flips it to
//	"verified" or "flagged". The SerialNumber is the physical identifier that
//	links the digital record to the real-world item.
type Product struct {
	ID                 string     `db:"id"                  json:"id"`
	SellerID           *string    `db:"seller_id"           json:"seller_id"`
	Name               string     `db:"name"                json:"name"`
	Description        *string    `db:"description"         json:"description"`
	Price              float64    `db:"price"               json:"price"`
	Category           *string    `db:"category"            json:"category"`
	ImageURL           *string    `db:"image_url"           json:"image_url"`
	StockQuantity      int        `db:"stock_quantity"      json:"stock_quantity"`
	SerialNumber       *string    `db:"serial_number"       json:"serial_number"`
	AuthenticityStatus *string    `db:"authenticity_status" json:"authenticity_status"`
	CreatedAt          *time.Time `db:"created_at"          json:"created_at"`
	UpdatedAt          *time.Time `db:"updated_at"          json:"updated_at"`
}
