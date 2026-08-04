using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Payments.Data.Entities;

/// <summary>
/// public.wallets — one row per user, holding the in-app balance.
///
/// This was <c>users.wallet_balance</c> before the split. It is payments-owned
/// data, and the users table moved to mypal_auth, so the balance moved here to
/// mypal_orders where it sits alongside the transactions ledger that explains it.
///
/// Orders and Payments both map this table: that shared database is what lets the
/// order insert and the wallet debit stay in one Postgres transaction, exactly as
/// they were in the monolith.
/// </summary>
[Table("wallets", Schema = "public")]
public class Wallet
{
    /// <summary>The owning user. References mypal_auth.users.id — no FK across databases.</summary>
    [Key]
    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("balance")]
    [Precision(15, 2)]
    public decimal Balance { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at", TypeName = "timestamp without time zone")]
    public DateTime? UpdatedAt { get; set; }
}
