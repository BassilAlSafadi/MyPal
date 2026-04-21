using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using MyPal.Infrastructure.Data.Entities.Enums;

namespace MyPal.Infrastructure.Data.Entities;

[Table("support_tickets", Schema = "public")]
public class SupportTicket
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("status")]
    public SupportTicketStatus? Status { get; set; }

    [Column("priority")]
    public SupportTicketPriority? Priority { get; set; }

    [Column("category")]
    public string? Category { get; set; }

    [Column("created_at", TypeName = "timestamp with time zone")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at", TypeName = "timestamp with time zone")]
    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;

    public Product Product { get; set; } = null!;
}

