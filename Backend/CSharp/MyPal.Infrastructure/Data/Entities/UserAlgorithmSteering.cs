using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Infrastructure.Data.Entities;

/// <summary>
/// Maps to public.user_algorithm_steering (composite PK: user_id + factor_key).
///
/// Go alignment: steering_models.go AlgorithmSteering.FactorKey (string).
/// The SQL column is named 'sector_name' for legacy reasons, but the canonical
/// domain term — used in the Go service, the AI inference layer, and all new code
/// — is 'factor_key'. The [Column] attribute bridges the physical name gap.
///
/// Weight semantics (from steering_models.go):
///   weight_multiplier is a float in [0.0, ∞).
///   1.0  = use the default model weight (no steering).
///   > 1  = amplify this factor in candidate scoring.
///   < 1  = suppress this factor in candidate scoring.
///   The AI inference layer reads these per-user multipliers before ranking.
///
///   Stored as 'double' (not decimal) intentionally: inference scaling is a
///   floating-point multiplication, not a financial computation. Using decimal
///   here would force an expensive cast on every inference call.
/// </summary>
[Table("user_algorithm_steering", Schema = "public")]
[PrimaryKey(nameof(UserId), nameof(FactorKey))]
public class UserAlgorithmSteering
{
    [Column("user_id")]
    public Guid UserId { get; set; }

    /// <summary>
    /// The domain-canonical name for this steering factor.
    /// Stored in the 'sector_name' column for historical reasons.
    /// </summary>
    [Column("sector_name")]
    [MaxLength(255)]
    public string FactorKey { get; set; } = null!;

    /// <summary>
    /// Inference-scaling multiplier. Uses double for IEEE 754 precision required
    /// by the ML scoring pipeline. Range: [0.0, ∞). Default: 1.0.
    /// </summary>
    [Column("weight_multiplier")]
    public double WeightMultiplier { get; set; } = 1.0;

    [Column("is_pinned")]
    public bool IsPinned { get; set; } = false;

    [Column("updated_at", TypeName = "timestamp with time zone")]
    public DateTimeOffset? UpdatedAt { get; set; }

    // Navigation
    public User User { get; set; } = null!;
}
