using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Infrastructure.Data.Entities;

/// <summary>
/// Maps to public.product_validation_results.
///
/// Each row represents a single AI/supply-chain authenticity validation run
/// against a MyPal product. Multiple rows may exist per product (audit history).
///
/// RawEvidence is a JSONB column containing the unstructured evidence payload
/// returned by the validation service. It is stored as a raw string here;
/// callers should deserialize with System.Text.Json as needed.
/// </summary>
[Table("product_validation_results", Schema = "public")]
public class ProductValidationResult
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    /// <summary>FK to public.products. Not a typed navigation — the validation service
    /// may reference products that are not yet fully hydrated in the C# context.</summary>
    [Column("product_id")]
    public Guid? ProductId { get; set; }

    /// <summary>Validation outcome, e.g. "verified", "flagged", "pending".</summary>
    [Column("status")]
    [MaxLength(50)]
    public string? Status { get; set; }

    /// <summary>Model confidence in the status decision. Range: [0.0, 1.0].</summary>
    [Column("confidence_score")]
    [Precision(5, 4)]
    public decimal? ConfidenceScore { get; set; }

    /// <summary>
    /// JSONB column. Unstructured evidence payload from the validation service.
    /// Stored as raw JSON string; deserialize at usage site.
    /// </summary>
    [Column("raw_evidence", TypeName = "jsonb")]
    public string? RawEvidence { get; set; }

    [Column("created_at", TypeName = "timestamp with time zone")]
    public DateTimeOffset? CreatedAt { get; set; }
}
