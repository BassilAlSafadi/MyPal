using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPal.Infrastructure.Migrations.Manual
{
    /// <inheritdoc />
    public partial class RenameOutboxId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'outbox_events' AND column_name = 'Id'
    ) THEN
        EXECUTE 'ALTER TABLE outbox_events RENAME COLUMN ""Id"" TO id';
    END IF;
END$$;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'outbox_events' AND column_name = 'id'
    ) THEN
        EXECUTE 'ALTER TABLE outbox_events RENAME COLUMN id TO ""Id""';
    END IF;
END$$;");
        }
    }
}
