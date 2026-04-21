using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using MyPal.Infrastructure.Data.Entities.Enums;

namespace MyPal.Infrastructure.Data.Entities;

[Table("orders", Schema = "public")]
public class Order
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("status")]
    public OrderStatus? Status { get; set; }

    [Column("total_amount")]
    [Precision(15, 2)]
    public decimal? TotalAmount { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at", TypeName = "timestamp without time zone")]
    public DateTime? UpdatedAt { get; set; }

    public User? User { get; set; }

    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}

