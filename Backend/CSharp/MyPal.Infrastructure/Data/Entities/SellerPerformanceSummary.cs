using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Infrastructure.Data.Entities;

/// <summary>
/// Maps to public.seller_performance_summaries.
///
/// This table is the output of the AI-generated vendor performance pipeline.
/// Rows are written by the Python inference service after it has processed
/// a batch of product reviews for a given vendor over a specific period.
///
/// JSONB fields:
///   TopComplaintThemes — a ranked array of complaint theme strings extracted
///                        by the NLP model, e.g. ["late_delivery", "poor_packaging"].
///                        Stored as raw JSON string; deserialize at the application layer.
///
/// The C# layer treats TopComplaintThemes as an opaque string to avoid coupling
/// the EF model to a specific JSON schema that the Python service may evolve.
/// Use System.Text.Json to deserialize when needed.
/// </summary>
[Table("seller_performance_summaries", Schema = "public")]
public class SellerPerformanceSummary
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("vendor_id")]
    public Guid? VendorId { get; set; }

    [Column("summary_period_start")]
    public DateOnly? SummaryPeriodStart { get; set; }

    [Column("summary_period_end")]
    public DateOnly? SummaryPeriodEnd { get; set; }

    /// <summary>Free-text narrative produced by the AI model for this vendor/period.</summary>
    [Column("ai_generated_summary")]
    public string? AiGeneratedSummary { get; set; }

    /// <summary>
    /// JSONB column. Stores a ranked list of complaint themes extracted by NLP.
    /// Example raw value: ["late_delivery","damaged_item","poor_packaging"]
    /// Mapped as string to remain schema-agnostic; deserialize at usage site.
    /// </summary>
    [Column("top_complaint_themes", TypeName = "jsonb")]
    public string? TopComplaintThemes { get; set; }

    [Column("sentiment_score")]
    [Precision(5, 4)]
    public decimal? SentimentScore { get; set; }

    [Column("created_at", TypeName = "timestamp with time zone")]
    public DateTimeOffset? CreatedAt { get; set; }
}
