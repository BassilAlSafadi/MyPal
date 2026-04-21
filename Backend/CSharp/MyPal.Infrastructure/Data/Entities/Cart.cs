using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("carts", Schema = "public")]
public class Cart
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    public User? User { get; set; }

    public ICollection<CartItem> CartItems { get; set; } = new List<CartItem>();
}

