using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace MyPal.Infrastructure.Data.Entities;

/// <summary>
/// Maps to public.seller_performance_summaries — AI-generated seller performance for a user (seller account).
/// </summary>
[Table("seller_performance_summaries", Schema = "public")]
public class SellerPerformanceSummary
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("seller_id")]
    public Guid? SellerId { get; set; }

    public User? Seller { get; set; }

    [Column("summary_period_start")]
    public DateOnly? SummaryPeriodStart { get; set; }

    [Column("summary_period_end")]
    public DateOnly? SummaryPeriodEnd { get; set; }

    [Column("ai_generated_summary")]
    public string? AiGeneratedSummary { get; set; }

    [Column("top_complaint_themes", TypeName = "jsonb")]
    public string? TopComplaintThemes { get; set; }

    [Column("sentiment_score")]
    [Precision(5, 4)]
    public decimal? SentimentScore { get; set; }

    [Column("grandma_score")]
    public int? GrandmaScore { get; set; }

    [Column("created_at", TypeName = "timestamp with time zone")]
    public DateTimeOffset? CreatedAt { get; set; }
}
