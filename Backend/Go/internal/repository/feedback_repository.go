package repository

import (
	"context"

	"mypal/api/go/internal/models"
)

// FeedbackRepository defines the contract for writing vendor feedback rows.
//
// Design note:
//
//	There is intentionally no "Update" or "Delete" method. Feedback is an
//	append-only audit trail. Modification is handled exclusively at the
//	database level through soft-delete or amendment policies — never by
//	overwriting the original row from the application layer.
type FeedbackRepository interface {
	// InsertFeedback writes a new vendor_feedback row. The Postgres trigger
	// attached to this table will automatically recompute the vendor's
	// aggregate trust_score after the insert commits.
	InsertFeedback(ctx context.Context, feedback *models.VendorFeedback) error

	// GetFeedbackByVendorID returns all feedback rows for a vendor, newest first.
	GetFeedbackByVendorID(ctx context.Context, vendorID string) ([]*models.VendorFeedback, error)
}
