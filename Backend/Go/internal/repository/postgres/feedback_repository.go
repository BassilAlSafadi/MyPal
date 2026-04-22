package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"mypal/api/go/internal/models"
	"mypal/api/go/internal/repository"
)

// Compile-time assertion: feedbackRepository must satisfy repository.FeedbackRepository.
var _ repository.FeedbackRepository = (*feedbackRepository)(nil)

type feedbackRepository struct {
	db *pgxpool.Pool
}

// NewFeedbackRepository constructs a Postgres-backed FeedbackRepository.
func NewFeedbackRepository(db *pgxpool.Pool) repository.FeedbackRepository {
	return &feedbackRepository{db: db}
}

// -----------------------------------------------------------------------------
// InsertFeedback
// -----------------------------------------------------------------------------

const insertFeedbackSQL = `
INSERT INTO public.vendor_feedback (
    id,
    vendor_id,
    buyer_id,
    order_id,
    rating,
    comment,
    created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, now()
)`

// InsertFeedback writes a new vendor_feedback row.
//
// Side effect: a Postgres trigger on vendor_feedback fires after each INSERT
// and recomputes the vendor's aggregate trust_score. This is transparent to
// the Go application — no additional logic is required here.
func (r *feedbackRepository) InsertFeedback(ctx context.Context, feedback *models.VendorFeedback) error {
	_, err := r.db.Exec(ctx, insertFeedbackSQL,
		feedback.ID,
		feedback.VendorID,
		feedback.BuyerID,
		feedback.OrderID,
		feedback.Rating,
		feedback.Comment,
	)
	if err != nil {
		return fmt.Errorf("feedbackRepository.InsertFeedback: exec: %w", err)
	}
	return nil
}

// -----------------------------------------------------------------------------
// GetFeedbackByVendorID
// -----------------------------------------------------------------------------

const getFeedbackByVendorIDSQL = `
SELECT
    id,
    vendor_id,
    buyer_id,
    order_id,
    rating,
    comment,
    created_at
FROM public.vendor_feedback
WHERE vendor_id = $1
ORDER BY created_at DESC`

// GetFeedbackByVendorID returns all feedback rows for a vendor, newest first.
func (r *feedbackRepository) GetFeedbackByVendorID(ctx context.Context, vendorID string) ([]*models.VendorFeedback, error) {
	rows, err := r.db.Query(ctx, getFeedbackByVendorIDSQL, vendorID)
	if err != nil {
		return nil, fmt.Errorf("feedbackRepository.GetFeedbackByVendorID: query: %w", err)
	}
	defer rows.Close()

	var results []*models.VendorFeedback
	for rows.Next() {
		fb := &models.VendorFeedback{}
		if err := rows.Scan(
			&fb.ID,
			&fb.VendorID,
			&fb.BuyerID,
			&fb.OrderID,
			&fb.Rating,
			&fb.Comment,
			&fb.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("feedbackRepository.GetFeedbackByVendorID: scan: %w", err)
		}
		results = append(results, fb)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("feedbackRepository.GetFeedbackByVendorID: rows: %w", err)
	}
	return results, nil
}
