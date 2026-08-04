using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Orders.Data.Entities;

[Table("notifications", Schema = "public")]
public class Notification
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("content")]
    public string? Content { get; set; }

    [Column("is_read")]
    public bool? IsRead { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    // user_id references mypal_auth.users — an ID column only after the split.
}

