using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPal.Listings.Data.Migrations
{
    /// <inheritdoc />
    public partial class FixProductEmbeddingsIvfflatIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The original ivfflat index used lists = 100, tuned for a catalogue of
            // hundreds of thousands of rows (pgvector's own guidance is lists ≈
            // rows / 1000). Against this catalogue's real size — a few dozen rows —
            // almost all of the 100 clusters are empty or hold a single row, and
            // ivfflat's default probes = 1 only visits one cluster per query. The
            // observable effect: semantic search silently missed clearly relevant
            // products (a query for "noise cancelling earbuds" returned zero
            // results even though the catalogue has wireless headphones) purely
            // because the query embedding landed in a near-empty cluster, not
            // because nothing matched.
            //
            // Dropping the index falls back to an exact sequential scan over
            // product_embeddings, which is what pgvector itself recommends before
            // a table has enough rows to make an approximate index worthwhile.
            // Exact search is correct at every catalogue size the "recreate the
            // index once it earns its keep" scaling path below is for growth.
            migrationBuilder.Sql("DROP INDEX IF EXISTS idx_product_embeddings_cosine;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE INDEX IF NOT EXISTS idx_product_embeddings_cosine
                    ON public.product_embeddings
                    USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 100);
                """);
        }
    }
}
