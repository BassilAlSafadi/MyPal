using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPal.Orders.Data.Migrations
{
    /// <summary>
    /// Renames the stored transaction type 'Deposit' to 'AddFunds', and removes
    /// withdrawing from the wallet.
    ///
    /// The type is rendered directly in the user's transaction history, so leaving
    /// the old token in the database would keep the old name on screen. There is no
    /// EF model change here — transactions.type is a plain string column whose legal
    /// values are enforced by a CHECK constraint — so the work is all raw SQL.
    ///
    /// Withdrawals used to be stored as a negative-amount 'Deposit'. Those rows are
    /// moved to an explicit 'Withdrawal' type rather than being swept into
    /// 'AddFunds': the feature is gone, but history should still say what happened.
    /// Nothing writes 'Withdrawal' any more.
    /// </summary>
    public partial class RenameDepositToAddFunds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The constraint has to come off first — the rows below are illegal under it.
            migrationBuilder.Sql("ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS ck_transactions_type;");

            // Past withdrawals: negative-amount deposits become a real Withdrawal.
            migrationBuilder.Sql("""
                UPDATE public.transactions
                SET type = 'Withdrawal'
                WHERE type = 'Deposit' AND amount < 0;
                """);

            // Everything else that was a deposit is now added funds.
            migrationBuilder.Sql("""
                UPDATE public.transactions
                SET type = 'AddFunds'
                WHERE type = 'Deposit';
                """);

            // 'Deposit' is no longer accepted; 'Withdrawal' is readable but unwritten.
            migrationBuilder.Sql("""
                ALTER TABLE public.transactions
                    ADD CONSTRAINT ck_transactions_type
                    CHECK (type IS NULL OR type IN ('Purchase', 'Refund', 'AddFunds', 'Withdrawal'));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS ck_transactions_type;");

            // Both types collapse back into 'Deposit'; the sign of amount is what
            // distinguished them before, and that is preserved.
            migrationBuilder.Sql("""
                UPDATE public.transactions
                SET type = 'Deposit'
                WHERE type IN ('AddFunds', 'Withdrawal');
                """);

            migrationBuilder.Sql("""
                ALTER TABLE public.transactions
                    ADD CONSTRAINT ck_transactions_type
                    CHECK (type IS NULL OR type IN ('Purchase', 'Refund', 'Deposit'));
                """);
        }
    }
}
