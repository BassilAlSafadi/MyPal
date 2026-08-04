using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyPal.Auth.Data.Entities;

/// <summary>Maps to public.life_track_history — narrative transitions for audit / replay.</summary>
[Table("life_track_history", Schema = "public")]
public class LifeTrackHistory
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("previous_story")]
    public string? PreviousStory { get; set; }

    [Column("event_trigger_type")]
    public string? EventTriggerType { get; set; }

    [Column("created_at", TypeName = "timestamp without time zone")]
    public DateTime? CreatedAt { get; set; }

    public User? User { get; set; }
}
