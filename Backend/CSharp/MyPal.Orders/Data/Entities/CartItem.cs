using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Orders.Data.Entities;

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

    // product_id references mypal_listings.products. The cart endpoint hydrates the
    // product details from the listings service rather than joining across databases.
}

