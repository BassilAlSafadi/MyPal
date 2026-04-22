package models

import "time"

// Order represents a row in the public.orders table.
//
// Snapshotting — Destination fields:
// The Destination* fields are a point-in-time copy of the user's location data
// captured at the moment CreateOrder is called. They are intentionally decoupled
// from the User record so that if a user updates their address in the future,
// all historical orders continue to reflect the address that was actually used
// for that delivery. This preserves legal, logistical, and audit integrity.
type Order struct {
	ID          string     `db:"id"           json:"id"`
	UserID      *string    `db:"user_id"      json:"user_id"`
	Status      *string    `db:"status"       json:"status"`
	TotalAmount *float64   `db:"total_amount" json:"total_amount"`
	CreatedAt   *time.Time `db:"created_at"   json:"created_at"`
	UpdatedAt   *time.Time `db:"updated_at"   json:"updated_at"`

	// Destination — snapshotted from User.{GooglePlaceID, Lat, Lng, FormattedAddress}
	// at the time the order was placed. Never updated after creation.
	DestinationGooglePlaceID *string  `db:"destination_google_place_id" json:"destination_google_place_id"`
	DestinationLat           *float64 `db:"destination_lat"             json:"destination_lat"`
	DestinationLng           *float64 `db:"destination_lng"             json:"destination_lng"`
	DestinationAddress       *string  `db:"destination_address"         json:"destination_address"`
}

// SnapshotUserLocation copies the user's current location into the order's
// destination fields. Call this once, immediately before persisting the Order.
//
// Why this exists:
//   - A user's profile address can change at any time.
//   - If we relied on a JOIN to users.lat/lng at query time, a user who moves
//     would cause every past order to appear at their new address — which is
//     factually wrong and breaks carrier records, tax documentation, and dispute
//     resolution.
//   - By snapshotting here, the delivery address becomes immutable and owned by
//     the Order row itself, independent of the User's future profile updates.
func (o *Order) SnapshotUserLocation(u *User) {
	o.DestinationGooglePlaceID = u.GooglePlaceID
	o.DestinationLat = u.Lat
	o.DestinationLng = u.Lng
	o.DestinationAddress = u.FormattedAddress
}
