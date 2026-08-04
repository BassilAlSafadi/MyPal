using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Orders.Data.Entities;

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

    /// <summary>
    /// Product name captured at purchase time. The products table is in
    /// mypal_listings now, so the order response can no longer join to it;
    /// snapshotting the name here also keeps historical orders readable if the
    /// seller later renames or removes the listing.
    /// </summary>
    [Column("product_name")]
    public string? ProductName { get; set; }

    [Column("quantity")]
    public int Quantity { get; set; }

    [Column("price_at_purchase")]
    [Precision(15, 2)]
    public decimal PriceAtPurchase { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    public Order? Order { get; set; }

    // product_id references mypal_listings.products; product_name above is the
    // snapshot taken at purchase time so order history renders without a cross-
    // database join (and stays accurate if the listing is later renamed).
}

