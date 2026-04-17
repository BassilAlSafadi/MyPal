using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("external_products", Schema = "public")]
public class ExternalProduct
{
    [Key]
    [Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("vendor_id")]
    public Guid? VendorId { get; set; }

    public Product Product { get; set; } = null!;

    public Vendor? Vendor { get; set; }
}

