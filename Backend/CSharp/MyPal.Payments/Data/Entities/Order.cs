using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Payments.Data.Entities;

/// <summary>
/// A read-only projection of public.orders, which the Orders service owns.
///
/// Payments maps only the three columns it needs: the wallet balance response
/// reports funds tied up in not-yet-completed orders as "escrow", which is the sum
/// of wallet_amount_used across the caller's pending orders. Both services address
/// the same mypal_orders database, so this stays a plain query rather than a call.
///
/// Payments never writes this table, and it is excluded from Payments' migrations —
/// the Orders migration is the single owner of the orders schema.
/// </summary>
[Table("orders", Schema = "public")]
public class Order
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    /// <summary>Kept as the raw string rather than the enum — Payments only compares it to 'Pending'.</summary>
    [Column("status")]
    public string? Status { get; set; }

    [Column("wallet_amount_used")]
    [Precision(15, 2)]
    public decimal WalletAmountUsed { get; set; }
}
