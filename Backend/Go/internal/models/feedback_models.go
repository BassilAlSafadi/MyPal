package models

import "time"

// VendorFeedback represents a row in the public.vendor_feedback table.
//
// Trust-score semantics:
//
//	Inserting a row into vendor_feedback triggers a Postgres function that
//	recalculates the vendor's aggregate trust score. The Go repository never
//	touches trust_score directly — it only inserts feedback rows and lets the
//	database maintain the derived value.
type VendorFeedback struct {
	ID        string     `db:"id"          json:"id"`
	VendorID  string     `db:"vendor_id"   json:"vendor_id"`
	BuyerID   string     `db:"buyer_id"    json:"buyer_id"`
	OrderID   *string    `db:"order_id"    json:"order_id"`
	Rating    int        `db:"rating"      json:"rating"` // 1-5
	Comment   *string    `db:"comment"     json:"comment"`
	CreatedAt *time.Time `db:"created_at"  json:"created_at"`
}
