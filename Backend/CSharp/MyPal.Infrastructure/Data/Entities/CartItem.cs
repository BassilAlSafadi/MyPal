using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("cart_items", Schema = "public")]
public class CartItem
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("cart_id")]
    public Guid? CartId { get; set; }

    [Column("product_id")]
    public Guid? ProductId { get; set; }

    [Column("quantity")]
    public int? Quantity { get; set; }

    public Cart? Cart { get; set; }

    public Product? Product { get; set; }
}

