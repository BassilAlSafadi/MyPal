using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using MyPal.Infrastructure.Data.Entities.Enums;

namespace MyPal.Infrastructure.Data.Entities;

[Table("orders", Schema = "public")]
public class Order
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("status")]
    public OrderStatus? Status { get; set; }

    [Column("total_amount")]
    [Precision(15, 2)]
    public decimal? TotalAmount { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at", TypeName = "timestamp without time zone")]
    public DateTime? UpdatedAt { get; set; }

    // -------------------------------------------------------------------------
    // Destination — snapshotted from User.{GooglePlaceId, Lat, Lng, FormattedAddress}
    // at the moment the order is placed. These fields are immutable after creation.
    //
    // Rationale: a FK join to users at query-time would reflect the user's
    // *current* address, not the address used for this specific delivery. By
    // copying the values here, historical orders remain accurate regardless of
    // future changes to the user's profile.
    // -------------------------------------------------------------------------

    [Column("destination_google_place_id")]
    public string? DestinationGooglePlaceId { get; set; }

    /// <summary>Delivery latitude at time of order placement (WGS 84). Stored as Postgres numeric(9,6).</summary>
    [Column("destination_lat", TypeName = "numeric")]
    [Precision(9, 6)]
    public double? DestinationLat { get; set; }

    /// <summary>Delivery longitude at time of order placement (WGS 84). Stored as Postgres numeric(9,6).</summary>
    [Column("destination_lng", TypeName = "numeric")]
    [Precision(9, 6)]
    public double? DestinationLng { get; set; }

    [Column("destination_address")]
    public string? DestinationAddress { get; set; }

    public User? User { get; set; }

    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}

