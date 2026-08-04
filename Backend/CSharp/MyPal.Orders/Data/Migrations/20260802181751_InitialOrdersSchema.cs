using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPal.Orders.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialOrdersSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.CreateTable(
                name: "carts",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_carts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    content = table.Column<string>(type: "text", nullable: true),
                    is_read = table.Column<bool>(type: "boolean", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notifications", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "orders",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "text", nullable: true),
                    total_amount = table.Column<decimal>(type: "numeric(15,2)", precision: 15, scale: 2, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    destination_google_place_id = table.Column<string>(type: "text", nullable: true),
                    destination_lat = table.Column<double>(type: "numeric(9,6)", precision: 9, scale: 6, nullable: true),
                    destination_lng = table.Column<double>(type: "numeric(9,6)", precision: 9, scale: 6, nullable: true),
                    destination_address = table.Column<string>(type: "text", nullable: true),
                    wallet_amount_used = table.Column<decimal>(type: "numeric(15,2)", precision: 15, scale: 2, nullable: false),
                    cod_amount_due = table.Column<decimal>(type: "numeric(15,2)", precision: 15, scale: 2, nullable: false),
                    payment_method = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_orders", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "outbox_events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "text", nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    trace_id = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    processed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    publish_status = table.Column<string>(type: "text", nullable: false, defaultValue: "pending"),
                    publish_attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    last_publish_attempt_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_outbox_events", x => x.id);
                    table.CheckConstraint("CK_outbox_events_publish_status", "publish_status IN ('pending', 'publishing', 'published', 'failed')");
                });

            migrationBuilder.CreateTable(
                name: "processed_events",
                columns: table => new
                {
                    event_id = table.Column<string>(type: "text", nullable: false),
                    consumer = table.Column<string>(type: "text", nullable: false),
                    processed_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_processed_events", x => new { x.event_id, x.consumer });
                });

            migrationBuilder.CreateTable(
                name: "saga_states",
                columns: table => new
                {
                    saga_id = table.Column<string>(type: "text", nullable: false),
                    workflow = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    current_step = table.Column<string>(type: "text", nullable: false),
                    completed_steps = table.Column<string>(type: "jsonb", nullable: false),
                    failed_step = table.Column<string>(type: "text", nullable: true),
                    compensations = table.Column<string>(type: "jsonb", nullable: false),
                    correlation_id = table.Column<string>(type: "text", nullable: false),
                    causation_id = table.Column<string>(type: "text", nullable: false),
                    timeout_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    failure_reason = table.Column<string>(type: "text", nullable: true),
                    retry_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saga_states", x => x.saga_id);
                });

            migrationBuilder.CreateTable(
                name: "wallets",
                schema: "public",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    balance = table.Column<decimal>(type: "numeric(15,2)", precision: 15, scale: 2, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_wallets", x => x.user_id);
                });

            migrationBuilder.CreateTable(
                name: "cart_items",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    cart_id = table.Column<Guid>(type: "uuid", nullable: true),
                    product_id = table.Column<Guid>(type: "uuid", nullable: true),
                    quantity = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_cart_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_cart_items_carts_cart_id",
                        column: x => x.cart_id,
                        principalSchema: "public",
                        principalTable: "carts",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "order_items",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    order_id = table.Column<Guid>(type: "uuid", nullable: true),
                    product_id = table.Column<Guid>(type: "uuid", nullable: true),
                    product_name = table.Column<string>(type: "text", nullable: true),
                    quantity = table.Column<int>(type: "integer", nullable: false),
                    price_at_purchase = table.Column<decimal>(type: "numeric(15,2)", precision: 15, scale: 2, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_order_items_orders_order_id",
                        column: x => x.order_id,
                        principalSchema: "public",
                        principalTable: "orders",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "transactions",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    order_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "text", nullable: true),
                    amount = table.Column<decimal>(type: "numeric(15,2)", precision: 15, scale: 2, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_transactions", x => x.id);
                    table.ForeignKey(
                        name: "FK_transactions_orders_order_id",
                        column: x => x.order_id,
                        principalSchema: "public",
                        principalTable: "orders",
                        principalColumn: "id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_cart_items_cart_id",
                schema: "public",
                table: "cart_items",
                column: "cart_id");

            migrationBuilder.CreateIndex(
                name: "IX_carts_user_id",
                schema: "public",
                table: "carts",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_user_id",
                schema: "public",
                table: "notifications",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_order_id",
                schema: "public",
                table: "order_items",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_user_id",
                schema: "public",
                table: "orders",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_outbox_events_publish_status_created_at",
                table: "outbox_events",
                columns: new[] { "publish_status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_transactions_order_id",
                schema: "public",
                table: "transactions",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_transactions_user_id",
                schema: "public",
                table: "transactions",
                column: "user_id");

            // ── Tables and constraints that are not EF-mapped ────────────────────
            //
            // saga_steps and api_idempotency were written by the Go gateway with raw
            // SQL and never had EF entities; orders.geo_snapshot is written by the
            // checkout orchestrator only. All three came with the code into this
            // service, so they are provisioned here in raw SQL.

            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS public.saga_steps (
                    id                     text PRIMARY KEY,
                    saga_id                text NOT NULL REFERENCES public.saga_states(saga_id) ON DELETE CASCADE,
                    step_name              text NOT NULL,
                    execution_order        integer NOT NULL,
                    status                 text NOT NULL,
                    "timestamp"            timestamptz NOT NULL DEFAULT now(),
                    compensation_required  boolean NOT NULL DEFAULT false,
                    compensation_completed boolean NOT NULL DEFAULT false,
                    error_details          text
                );
                """);
            migrationBuilder.Sql("""
                CREATE INDEX IF NOT EXISTS idx_saga_steps_saga_id
                    ON public.saga_steps (saga_id, execution_order);
                """);

            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS public.api_idempotency (
                    idempotency_key  text PRIMARY KEY,
                    fingerprint      text NOT NULL,
                    correlation_id   text,
                    status           text NOT NULL,
                    status_code      integer,
                    response_payload bytea,
                    created_at       timestamptz NOT NULL DEFAULT now(),
                    updated_at       timestamptz NOT NULL DEFAULT now(),
                    expires_at       timestamptz
                );
                """);
            migrationBuilder.Sql("""
                CREATE INDEX IF NOT EXISTS idx_api_idempotency_status_updated
                    ON public.api_idempotency (status, updated_at);
                """);

            // Written by the checkout orchestrator's parent-order insert.
            migrationBuilder.Sql("ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS geo_snapshot jsonb;");

            // CHECK constraints the pre-split database enforced. The enum converters in
            // OrdersDbContext are written to satisfy exactly these, so they are restored
            // here rather than left to the ORM.
            migrationBuilder.Sql("""
                ALTER TABLE public.orders
                    ADD CONSTRAINT ck_orders_status
                    CHECK (status IS NULL OR status IN ('Pending', 'Paid', 'Shipped', 'Delivered', 'cancelled'));
                """);
            migrationBuilder.Sql("""
                ALTER TABLE public.orders
                    ADD CONSTRAINT ck_orders_payment_method
                    CHECK (payment_method IS NULL OR payment_method IN ('Wallet', 'COD', 'Split'));
                """);
            migrationBuilder.Sql("""
                ALTER TABLE public.transactions
                    ADD CONSTRAINT ck_transactions_type
                    CHECK (type IS NULL OR type IN ('Purchase', 'Refund', 'Deposit'));
                """);

            // ── process_wallet_payment ──────────────────────────────────────────
            //
            // The pre-split database had a BEFORE INSERT trigger on orders that
            // computed the wallet/cash split and debited the balance authoritatively,
            // so clients could not manipulate payment amounts. Its DDL only ever
            // existed in the hosted Supabase project — it was never checked into this
            // repository — so the body below is reconstructed from the behaviour the
            // code and docs describe:
            //   Wallet → wallet_amount_used = total_amount, cod_amount_due = 0
            //   COD    → cod_amount_due     = total_amount, wallet_amount_used = 0
            //   Split  → wallet covers what it can, the remainder is cash on delivery
            // It now debits public.wallets, since users.wallet_balance moved here.
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION public.process_wallet_payment()
                RETURNS TRIGGER AS $$
                DECLARE
                    available numeric(15,2);
                    spend     numeric(15,2);
                BEGIN
                    IF NEW.user_id IS NULL THEN
                        RETURN NEW;
                    END IF;

                    -- Lock the wallet row so concurrent orders cannot both spend it.
                    SELECT balance INTO available
                    FROM public.wallets
                    WHERE user_id = NEW.user_id
                    FOR UPDATE;

                    IF NOT FOUND THEN
                        available := 0;
                    END IF;

                    IF NEW.payment_method = 'COD' THEN
                        spend := 0;
                    ELSIF NEW.payment_method = 'Wallet' THEN
                        IF available < COALESCE(NEW.total_amount, 0) THEN
                            RAISE EXCEPTION 'Insufficient wallet balance for order %', NEW.id
                                USING ERRCODE = '23514';
                        END IF;
                        spend := COALESCE(NEW.total_amount, 0);
                    ELSE
                        -- Split, or unspecified: use as much wallet as is available.
                        spend := LEAST(available, COALESCE(NEW.total_amount, 0));
                    END IF;

                    NEW.wallet_amount_used := spend;
                    NEW.cod_amount_due     := COALESCE(NEW.total_amount, 0) - spend;

                    IF NEW.payment_method IS NULL THEN
                        NEW.payment_method := CASE
                            WHEN spend = 0 THEN 'COD'
                            WHEN NEW.cod_amount_due = 0 THEN 'Wallet'
                            ELSE 'Split'
                        END;
                    END IF;

                    IF spend > 0 THEN
                        UPDATE public.wallets
                        SET balance = balance - spend, updated_at = now()
                        WHERE user_id = NEW.user_id;
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                """);
            migrationBuilder.Sql("""
                CREATE TRIGGER trg_process_wallet_payment
                    BEFORE INSERT ON public.orders
                    FOR EACH ROW EXECUTE FUNCTION public.process_wallet_payment();
                """);

            // Keeps orders.updated_at honest without every writer remembering to set it.
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION public.touch_updated_at()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at := now();
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                """);
            migrationBuilder.Sql("""
                CREATE TRIGGER trg_orders_touch_updated_at
                    BEFORE UPDATE ON public.orders
                    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_orders_touch_updated_at ON public.orders;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_process_wallet_payment ON public.orders;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS public.touch_updated_at();");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS public.process_wallet_payment();");
            migrationBuilder.Sql("DROP TABLE IF EXISTS public.api_idempotency;");
            migrationBuilder.Sql("DROP TABLE IF EXISTS public.saga_steps;");

            migrationBuilder.DropTable(
                name: "cart_items",
                schema: "public");

            migrationBuilder.DropTable(
                name: "notifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "order_items",
                schema: "public");

            migrationBuilder.DropTable(
                name: "outbox_events");

            migrationBuilder.DropTable(
                name: "processed_events");

            migrationBuilder.DropTable(
                name: "saga_states");

            migrationBuilder.DropTable(
                name: "transactions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "wallets",
                schema: "public");

            migrationBuilder.DropTable(
                name: "carts",
                schema: "public");

            migrationBuilder.DropTable(
                name: "orders",
                schema: "public");
        }
    }
}
