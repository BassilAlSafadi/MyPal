using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

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

    [Column("is_buyer")]
    public bool IsBuyer { get; set; } = true;

    [Column("is_seller")]
    public bool IsSeller { get; set; } = false;

    [Column("roles")]
    public string[] Roles { get; set; } = ["buyer"];

    // -------------------------------------------------------------------------
    // Google Maps location — the user's current saved delivery address.
    // These values are snapshotted into Order.Destination* at CreateOrder time
    // so that historical orders are never affected by future profile updates.
    // -------------------------------------------------------------------------

    [Column("google_place_id")]
    public string? GooglePlaceId { get; set; }

    /// <summary>Latitude in decimal degrees (WGS 84). Stored as Postgres numeric(9,6).</summary>
    [Column("lat", TypeName = "numeric")]
    [Precision(9, 6)]
    public double? Lat { get; set; }

    /// <summary>Longitude in decimal degrees (WGS 84). Stored as Postgres numeric(9,6).</summary>
    [Column("lng", TypeName = "numeric")]
    [Precision(9, 6)]
    public double? Lng { get; set; }

    [Column("city")]
    public string? City { get; set; }

    [Column("state")]
    public string? State { get; set; }

    [Column("life_track_story")]
    public string? LifeTrackStory { get; set; }

    public ICollection<Cart> Carts { get; set; } = new List<Cart>();

    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public ICollection<Order> Orders { get; set; } = new List<Order>();

    public ICollection<ProductReview> ProductReviews { get; set; } = new List<ProductReview>();

    public ICollection<SupportTicket> SupportTickets { get; set; } = new List<SupportTicket>();

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();

    public ICollection<Vendor> Vendors { get; set; } = new List<Vendor>();

    public ICollection<UserAlgorithmSteering> AlgorithmSteerings { get; set; } = new List<UserAlgorithmSteering>();

    public ICollection<LifeTrackHistory> LifeTrackHistories { get; set; } = new List<LifeTrackHistory>();
}

