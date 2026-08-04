using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Listings.Data.Entities;

/// <summary>
/// Maps to public.product_media.
/// Stores ordered photos and videos associated with a product listing.
/// MediaType maps to the SQL CHECK ('photo', 'video').
/// </summary>
[Table("product_media", Schema = "public")]
public class ProductMedia
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("url")]
    public string Url { get; set; } = null!;

    /// <summary>Either "photo" or "video" per the SQL CHECK constraint.</summary>
    [Column("media_type")]
    [MaxLength(10)]
    public string? MediaType { get; set; }

    [Column("display_order")]
    public int DisplayOrder { get; set; } = 0;

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    // Navigation
    public Product Product { get; set; } = null!;
}
