using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Orders.Data.Entities;

[Table("transactions", Schema = "public")]
public class Transaction
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("order_id")]
    public Guid? OrderId { get; set; }

    [Column("type")]
    public string? Type { get; set; }

    [Column("amount")]
    [Precision(15, 2)]
    public decimal Amount { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    // user_id references mypal_auth.users — an ID column only after the split.
    public Order? Order { get; set; }
}

