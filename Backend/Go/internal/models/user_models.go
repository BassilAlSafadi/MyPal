package models

import "time"

// User represents a row in the public.users table.
// Location fields (GooglePlaceID, Lat, Lng, FormattedAddress) store the user's
// current saved delivery address from Google Maps. These values are snapshotted
// into the Order at checkout — see CreateOrder business logic.
type User struct {
	ID            string     `db:"id"                json:"id"`
	FirstName     string     `db:"first_name"        json:"first_name"`
	LastName      string     `db:"last_name"         json:"last_name"`
	Email         string     `db:"email"             json:"email"`
	Phone         *string    `db:"phone"             json:"phone"`
	WalletBalance *float64   `db:"wallet_balance"    json:"wallet_balance"`
	CreatedAt     *time.Time `db:"created_at"       json:"created_at"`
	UpdatedAt     *time.Time `db:"updated_at"       json:"updated_at"`
	IsDeleted     *bool      `db:"is_deleted"        json:"is_deleted"`

	// Google Maps location — the user's current saved delivery address.
	// These are snapshotted into Order.Destination* at CreateOrder time.
	GooglePlaceID    *string  `db:"google_place_id"   json:"google_place_id"`
	Lat              *float64 `db:"lat"               json:"lat"`
	Lng              *float64 `db:"lng"               json:"lng"`
	FormattedAddress *string  `db:"formatted_address" json:"formatted_address"`
}
