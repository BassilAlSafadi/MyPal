using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Listings.Data.Entities;

/// <summary>
/// Owned-product extension table. Joined to products via a shared PK (product_id).
/// Stores MyPal-specific authenticity and serial tracking fields.
/// </summary>
[Table("mypal_products", Schema = "public")]
public class MyPalProduct
{
    [Key]
    [Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("serial_number")]
    public string? SerialNumber { get; set; }

    /// <summary>Authenticity lifecycle state: "pending" → "verified" | "flagged".</summary>
    [Column("authenticity_status")]
    public string AuthenticityStatus { get; set; } = "pending";

    [Column("last_verified_at", TypeName = "timestamp without time zone")]
    public DateTime? LastVerifiedAt { get; set; }

    public virtual Product Product { get; set; } = null!;
}