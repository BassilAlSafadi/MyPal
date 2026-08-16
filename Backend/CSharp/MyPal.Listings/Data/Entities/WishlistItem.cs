using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Listings.Data.Entities;

/// <summary>
/// Maps to public.wishlist_items — a user's saved (wishlisted) products.
/// One row per (user, product); enforced by a unique index in the migration.
/// </summary>
[Table("wishlist_items", Schema = "public")]
public class WishlistItem
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    // user_id references mypal_auth.users — an ID column only after the split.
    public Product? Product { get; set; }
}
