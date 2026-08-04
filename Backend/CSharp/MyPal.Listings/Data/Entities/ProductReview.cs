using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Listings.Data.Entities;

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

    // user_id points at mypal_auth.users and order_item_id at mypal_orders.order_items.
    // Both stay as plain ID columns after the split; only Product is local.
    public Product? Product { get; set; }
}

