package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgxvec "github.com/pgvector/pgvector-go/pgx"
)

// ConfigurePGVectorAfterConnect registers pgvector codecs on every pooled connection.
// Chain with any existing AfterConnect hook on cfg.
func ConfigurePGVectorAfterConnect(cfg *pgxpool.Config) {
	prev := cfg.AfterConnect
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		if prev != nil {
			if err := prev(ctx, c); err != nil {
				return err
			}
		}
		return pgxvec.RegisterTypes(ctx, c)
	}
}
