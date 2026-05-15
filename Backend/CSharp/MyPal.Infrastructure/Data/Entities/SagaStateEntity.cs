using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("saga_states")]
public class SagaStateEntity
{
    [Key]
    [Column("saga_id")]
    public string SagaId { get; set; } = string.Empty;

    [Column("workflow")]
    public string Workflow { get; set; } = string.Empty;

    [Column("status")]
    public string Status { get; set; } = string.Empty;

    [Column("current_step")]
    public string CurrentStep { get; set; } = string.Empty;

    [Column("completed_steps", TypeName = "jsonb")]
    public string CompletedSteps { get; set; } = "[]"; // JSON array of strings

    [Column("failed_step")]
    public string? FailedStep { get; set; }

    [Column("compensations", TypeName = "jsonb")]
    public string Compensations { get; set; } = "[]"; // JSON array of objects

    [Column("correlation_id")]
    public string CorrelationId { get; set; } = string.Empty;

    [Column("causation_id")]
    public string CausationId { get; set; } = string.Empty;

    [Column("timeout_at", TypeName = "timestamp with time zone")]
    public DateTime? TimeoutAt { get; set; }

    [Column("failure_reason")]
    public string? FailureReason { get; set; }

    [Column("retry_count")]
    public int RetryCount { get; set; }

    [Column("updated_at", TypeName = "timestamp without time zone")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
