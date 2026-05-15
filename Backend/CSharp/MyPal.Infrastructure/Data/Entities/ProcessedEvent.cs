using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Infrastructure.Data.Entities;

[Table("processed_events")]
public class ProcessedEvent
{
    [Column("event_id")]
    public string EventId { get; set; } = string.Empty;

    [Column("consumer")]
    public string Consumer { get; set; } = string.Empty;

    [Column("processed_at", TypeName = "timestamp without time zone")]
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}
