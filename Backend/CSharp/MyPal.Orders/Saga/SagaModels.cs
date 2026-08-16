using System.Text.Json.Serialization;

namespace MyPal.Orders.Saga;

/// <summary>
/// Port of Backend/Go/internal/gateway/saga/models.go. The saga_states and
/// saga_steps tables are orders-owned, so the durable-state machine came into
/// this service with the checkout flow it coordinates.
/// </summary>
public static class SagaStatus
{
    public const string Processing = "PROCESSING";
    public const string Completed = "COMPLETED";
    public const string Failed = "FAILED";
    public const string Compensating = "COMPENSATING";
    public const string Compensated = "COMPENSATED";
    public const string DeadLetter = "DEAD_LETTER";
}

public static class SagaStepStatus
{
    public const string Started = "STARTED";
    public const string Completed = "COMPLETED";
    public const string Failed = "FAILED";
    public const string Compensated = "COMPENSATED";
}

public sealed class SagaState
{
    public string Id { get; set; } = "";
    public string Workflow { get; set; } = "";
    public string CorrelationId { get; set; } = "";
    public string CausationId { get; set; } = "";
    public string CurrentStatus { get; set; } = "";
    public string CurrentStep { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? TimeoutAt { get; set; }
    public string? FailureReason { get; set; }
    public int RetryCount { get; set; }
}

public sealed class SagaStep
{
    public string Id { get; set; } = "";
    public string SagaId { get; set; } = "";
    public string StepName { get; set; } = "";
    public int ExecutionOrder { get; set; }
    public string Status { get; set; } = "";
    public DateTime Timestamp { get; set; }
    public bool CompensationRequired { get; set; }
    public bool CompensationCompleted { get; set; }
    public string? ErrorDetails { get; set; }
}

public sealed record SagaStatusResponse(
    [property: JsonPropertyName("saga_id")] string SagaId,
    [property: JsonPropertyName("workflow")] string Workflow,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("current_step")] string CurrentStep,
    [property: JsonPropertyName("completed")] bool Completed,
    [property: JsonPropertyName("failure_reason")] string? FailureReason,
    [property: JsonPropertyName("updated_at")] DateTime? UpdatedAt);
