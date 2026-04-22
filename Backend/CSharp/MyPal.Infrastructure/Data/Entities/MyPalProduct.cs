using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("mypal_products", Schema = "public")]
public class MyPalProduct
{
    [Key]
    [Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("serial_number")]
    public string? SerialNumber { get; set; }

    [Column("authenticity_status")]
    public string AuthenticityStatus { get; set; } = "pending";

    [Column("last_verified_at")]
    public DateTime? LastVerifiedAt { get; set; }
    [Column("serial_number")]
    public string? SerialNumber { get; set; }

    [Column("authenticity_status")]
    public string AuthenticityStatus { get; set; } = "pending";

    [Column("last_verified_at", TypeName = "timestamp without time zone")]
    public DateTime? LastVerifiedAt { get; set; }
    public virtual Product Product { get; set; } = null!;
}