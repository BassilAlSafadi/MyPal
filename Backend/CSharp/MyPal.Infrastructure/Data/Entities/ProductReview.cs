using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("product_reviews", Schema = "public")]
public class ProductReview
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("product_id")]
    public Guid? ProductId { get; set; }

    [Column("order_item_id")]
    public Guid? OrderItemId { get; set; }

    [Column("score")]
    public int? Score { get; set; }

    [Column("comment")]
    public string? Comment { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    public User? User { get; set; }

    public Product? Product { get; set; }

    public OrderItem? OrderItem { get; set; }
}

