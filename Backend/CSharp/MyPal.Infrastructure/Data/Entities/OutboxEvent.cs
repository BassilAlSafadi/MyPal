using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("outbox_events")]
public class OutboxEvent
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("type")]
    public string Type { get; set; } = string.Empty;

    [Column("payload", TypeName = "jsonb")]
    public string Payload { get; set; } = string.Empty; // JSON

    [Column("trace_id")]
    public string TraceId { get; set; } = string.Empty;

    [Column("created_at", TypeName = "timestamp with time zone")]
    public DateTime CreatedAt { get; set; }

    [Column("processed_at", TypeName = "timestamp with time zone")]
    public DateTime? ProcessedAt { get; set; }

    [Column("error")]
    public string? Error { get; set; }

    [Column("publish_status")]
    public string PublishStatus { get; set; } = "pending";

    [Column("publish_attempts")]
    public int PublishAttempts { get; set; }

    [Column("last_publish_attempt_at", TypeName = "timestamp with time zone")]
    public DateTime? LastPublishAttemptAt { get; set; }

    [Column("updated_at", TypeName = "timestamp with time zone")]
    public DateTime UpdatedAt { get; set; }
}
