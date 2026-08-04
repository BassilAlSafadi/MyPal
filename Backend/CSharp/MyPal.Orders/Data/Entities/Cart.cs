using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Orders.Data.Entities;

[Table("carts", Schema = "public")]
public class Cart
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    // user_id references mypal_auth.users — an ID column only after the split.
    public ICollection<CartItem> CartItems { get; set; } = new List<CartItem>();
}

