using System.Text.Json;
using Npgsql;

namespace MyPal.Orders.Saga;

/// <summary>
/// Durable saga persistence. Port of Backend/Go/internal/gateway/saga/store.go —
/// same SQL, same optimistic-concurrency semantics, same DLQ escalation. It runs
/// against mypal_orders, where saga_states and saga_steps live.
/// </summary>
public sealed class SagaStore
{
    private readonly string _connectionString;

    public SagaStore(string connectionString) => _connectionString = connectionString;

    public NpgsqlConnection CreateConnection() => new(_connectionString);

    /// <summary>Returns the current durable state for a saga, or null when unknown.</summary>
    public async Task<SagaStatusResponse?> GetStatusAsync(string sagaId, CancellationToken ct = default)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand("""
            SELECT saga_id, workflow, status, current_step, failure_reason, updated_at
            FROM saga_states
            WHERE saga_id = $1
            """, conn);
        cmd.Parameters.AddWithValue(sagaId);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        var status = reader.GetString(2);
        return new SagaStatusResponse(
            reader.GetString(0),
            reader.GetString(1),
            status,
            reader.GetString(3),
            status is SagaStatus.Completed or SagaStatus.Compensated or SagaStatus.DeadLetter,
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetDateTime(5));
    }

    /// <summary>Durably starts a saga and logs the initial step.</summary>
    public async Task InitializeSagaAsync(NpgsqlConnection conn, NpgsqlTransaction tx, SagaState state, SagaStep step, CancellationToken ct = default)
    {
        var workflow = string.IsNullOrEmpty(state.Workflow) ? "checkout" : state.Workflow;
        var completedJson = JsonSerializer.Serialize(new[] { step.StepName });

        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO saga_states (
                saga_id, workflow, status, current_step, completed_steps, failed_step, compensations,
                correlation_id, causation_id, timeout_at, failure_reason, retry_count, updated_at
            ) VALUES ($1, $2, $3, $4, $5::jsonb, NULL, '[]'::jsonb, $6, $7, $8, NULL, $9, $10)
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue(state.Id);
            cmd.Parameters.AddWithValue(workflow);
            cmd.Parameters.AddWithValue(state.CurrentStatus);
            cmd.Parameters.AddWithValue(step.StepName);
            cmd.Parameters.AddWithValue(completedJson);
            cmd.Parameters.AddWithValue(state.CorrelationId);
            cmd.Parameters.AddWithValue(state.CausationId);
            cmd.Parameters.AddWithValue((object?)state.TimeoutAt ?? DBNull.Value);
            cmd.Parameters.AddWithValue(state.RetryCount);
            cmd.Parameters.AddWithValue(state.UpdatedAt);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        await InsertStepAsync(conn, tx, step, ct);
    }

    /// <summary>Appends a step to the step log and updates the current step on the saga state.</summary>
    public async Task LogStepAsync(NpgsqlConnection conn, NpgsqlTransaction tx, SagaStep step, CancellationToken ct = default)
    {
        await InsertStepAsync(conn, tx, step, ct);

        await using var cmd = new NpgsqlCommand("""
            UPDATE saga_states
            SET current_step = $2,
                completed_steps = COALESCE(completed_steps, '[]'::jsonb) || to_jsonb($3::text),
                updated_at = $4
            WHERE saga_id = $1
            """, conn, tx);
        cmd.Parameters.AddWithValue(step.SagaId);
        cmd.Parameters.AddWithValue(step.StepName);
        cmd.Parameters.AddWithValue(step.StepName);
        cmd.Parameters.AddWithValue(step.Timestamp);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Marks a successfully finished saga as COMPLETED (durable terminal state).</summary>
    public async Task CompleteSagaAsync(NpgsqlConnection conn, NpgsqlTransaction tx, string sagaId, CancellationToken ct = default)
    {
        int affected;
        await using (var cmd = new NpgsqlCommand("""
            UPDATE saga_states
            SET status = $2,
                updated_at = now()
            WHERE saga_id = $1
              AND status = $3
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue(sagaId);
            cmd.Parameters.AddWithValue(SagaStatus.Completed);
            cmd.Parameters.AddWithValue(SagaStatus.Processing);
            affected = await cmd.ExecuteNonQueryAsync(ct);
        }

        if (affected != 0) return;

        await using var probe = new NpgsqlCommand("SELECT status FROM saga_states WHERE saga_id = $1", conn, tx);
        probe.Parameters.AddWithValue(sagaId);
        var currentStatus = await probe.ExecuteScalarAsync(ct) as string;

        throw new InvalidOperationException(currentStatus is null
            ? $"optimistic concurrency failure: saga {sagaId} not found"
            : $"optimistic concurrency failure: saga {sagaId} is in state {currentStatus}, expected {SagaStatus.Processing}");
    }

    /// <summary>Durably changes the overall saga status.</summary>
    public async Task TransitionSagaStatusAsync(NpgsqlConnection conn, NpgsqlTransaction tx, string sagaId, string status, string? failureReason, CancellationToken ct = default)
    {
        await using var cmd = new NpgsqlCommand("""
            UPDATE saga_states
            SET status = $2, failure_reason = COALESCE($3, failure_reason), updated_at = now()
            WHERE saga_id = $1
            """, conn, tx);
        cmd.Parameters.AddWithValue(sagaId);
        cmd.Parameters.AddWithValue(status);
        cmd.Parameters.AddWithValue((object?)failureReason ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Marks a saga DEAD_LETTER when compensation attempts are exhausted.</summary>
    public async Task EscalateToDlqAsync(string sagaId, string reason, CancellationToken ct = default)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand("""
            UPDATE saga_states
            SET status = 'DEAD_LETTER',
                failure_reason = CASE
                    WHEN failure_reason IS NULL OR failure_reason = '' THEN $2
                    ELSE failure_reason || '; DLQ: ' || $2
                END,
                updated_at = now()
            WHERE saga_id = $1
            """, conn);
        cmd.Parameters.AddWithValue(sagaId);
        cmd.Parameters.AddWithValue(reason);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task InsertStepAsync(NpgsqlConnection conn, NpgsqlTransaction tx, SagaStep step, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO saga_steps (
                id, saga_id, step_name, execution_order, status,
                "timestamp", compensation_required, compensation_completed, error_details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """, conn, tx);
        cmd.Parameters.AddWithValue(step.Id);
        cmd.Parameters.AddWithValue(step.SagaId);
        cmd.Parameters.AddWithValue(step.StepName);
        cmd.Parameters.AddWithValue(step.ExecutionOrder);
        cmd.Parameters.AddWithValue(step.Status);
        cmd.Parameters.AddWithValue(step.Timestamp);
        cmd.Parameters.AddWithValue(step.CompensationRequired);
        cmd.Parameters.AddWithValue(step.CompensationCompleted);
        cmd.Parameters.AddWithValue((object?)step.ErrorDetails ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
