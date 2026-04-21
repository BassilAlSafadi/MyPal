using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("mypal_products", Schema = "public")]
public class MyPalProduct
{
    [Key]
    [Column("product_id")]
    public Guid ProductId { get; set; }

    public Product Product { get; set; } = null!;
}

