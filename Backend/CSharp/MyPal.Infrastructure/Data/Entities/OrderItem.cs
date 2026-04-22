using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Infrastructure.Data.Entities;

[Table("order_items", Schema = "public")]
public class OrderItem
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("order_id")]
    public Guid? OrderId { get; set; }

    [Column("product_id")]
    public Guid? ProductId { get; set; }

    [Column("quantity")]
    public int Quantity { get; set; }

    [Column("price_at_purchase")]
    [Precision(15, 2)]
    public decimal PriceAtPurchase { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    public Order? Order { get; set; }

    public Product? Product { get; set; }

    public ICollection<ProductReview> ProductReviews { get; set; } = new List<ProductReview>();
}

