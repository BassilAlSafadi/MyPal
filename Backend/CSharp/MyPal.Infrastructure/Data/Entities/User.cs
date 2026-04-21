using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("users", Schema = "public")]
public class User
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("first_name")]
    public string FirstName { get; set; } = null!;

    [Column("last_name")]
    public string LastName { get; set; } = null!;

    [Column("email")]
    public string Email { get; set; } = null!;

    [Column("phone")]
    public string? Phone { get; set; }

    [Column("wallet_balance")]
    [Precision(15, 2)]
    public decimal? WalletBalance { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at", TypeName = "timestamp without time zone")]
    public DateTime? UpdatedAt { get; set; }

    [Column("is_deleted")]
    public bool? IsDeleted { get; set; }

    public ICollection<Cart> Carts { get; set; } = new List<Cart>();

    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public ICollection<Order> Orders { get; set; } = new List<Order>();

    public ICollection<ProductReview> ProductReviews { get; set; } = new List<ProductReview>();

    public ICollection<SupportTicket> SupportTickets { get; set; } = new List<SupportTicket>();

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();

    public ICollection<Vendor> Vendors { get; set; } = new List<Vendor>();
}

