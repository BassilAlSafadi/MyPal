using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("vendors", Schema = "public")]
public class Vendor
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("business_email")]
    public string? BusinessEmail { get; set; }

    [Column("contact_email")]
    public string? ContactEmail { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at", TypeName = "timestamp without time zone")]
    public DateTime? UpdatedAt { get; set; }

    [Column("is_deleted")]
    public bool? IsDeleted { get; set; }

    public User? User { get; set; }

    public ICollection<ExternalProduct> ExternalProducts { get; set; } = new List<ExternalProduct>();
}

