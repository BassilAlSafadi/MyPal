using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("product_attributes", Schema = "public")]
public class ProductAttribute
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("product_id")]
    public Guid? ProductId { get; set; }

    [Column("name")]
    public string? Name { get; set; }

    [Column("value")]
    public string? Value { get; set; }

    public Product? Product { get; set; }
}

