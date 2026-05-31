using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using MyPal.Infrastructure.Data.Entities.Enums;

namespace MyPal.Infrastructure.Data.Entities;

[Table("products", Schema = "public")]
public class Product
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("name")]
    public string Name { get; set; } = null!;

    [Column("description")]
    public string? Description { get; set; }

    [Column("type")]
    public string? Type { get; set; }

    [Column("category")]
    public string? Category { get; set; }

    [Column("current_price")]
    [Precision(15, 2)]
    public decimal? CurrentPrice { get; set; }

    [Column("stock_qty")]
    public int? StockQty { get; set; }

    /// <summary>The user who created this listing. Enforced on update/delete so a
    /// seller can only mutate their own products. Null for legacy/seeded catalog rows.</summary>
    [Column("created_by")]
    public Guid? CreatedBy { get; set; }

    [Column("discriminator")]
    public ProductDiscriminator? Discriminator { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at", TypeName = "timestamp without time zone")]
    public DateTime? UpdatedAt { get; set; }

    [Column("is_deleted")]
    public bool? IsDeleted { get; set; }

    public ExternalProduct? ExternalProduct { get; set; }

    public MyPalProduct? MyPalProduct { get; set; }

    public ICollection<CartItem> CartItems { get; set; } = new List<CartItem>();

    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();

    public ICollection<ProductAttribute> ProductAttributes { get; set; } = new List<ProductAttribute>();

    public ICollection<ProductReview> ProductReviews { get; set; } = new List<ProductReview>();

    public ICollection<SupportTicket> SupportTickets { get; set; } = new List<SupportTicket>();

    public ICollection<ProductMedia> ProductMedia { get; set; } = new List<ProductMedia>();
}

