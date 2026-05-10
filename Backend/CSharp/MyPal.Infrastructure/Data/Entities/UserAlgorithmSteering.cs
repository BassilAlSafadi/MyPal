using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Infrastructure.Data.Entities;

/// <summary>
/// Maps to public.user_algorithm_steering (composite PK: user_id + sector_name).
/// Go alignment: AlgorithmSteering.SectorName.
/// </summary>
[Table("user_algorithm_steering", Schema = "public")]
[PrimaryKey(nameof(UserId), nameof(SectorName))]
public class UserAlgorithmSteering
{
    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("sector_name")]
    [MaxLength(255)]
    public string SectorName { get; set; } = null!;

    [Column("weight_multiplier")]
    public double WeightMultiplier { get; set; } = 1.0;

    [Column("is_pinned")]
    public bool IsPinned { get; set; }

    [Column("updated_at", TypeName = "timestamp with time zone")]
    public DateTimeOffset? UpdatedAt { get; set; }

    public User User { get; set; } = null!;
}
