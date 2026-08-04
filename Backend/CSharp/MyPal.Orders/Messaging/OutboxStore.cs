using Npgsql;

namespace MyPal.Orders.Messaging;

/// <summary>
/// Port of Backend/Go/internal/gateway/messaging/outbox_store.go. Every statement
/// is the Go one verbatim — including the FOR UPDATE SKIP LOCKED claim and the
/// attempt-matched MarkFailed guard that makes concurrent dispatchers safe.
/// </summary>
public sealed class OutboxStore
{
    public const string StatusPending = "pending";
    public const string StatusPublishing = "publishing";
    public const string StatusPublished = "published";
    public const string StatusFailed = "failed";

    public const int DefaultBatchSize = 50;
    public static readonly TimeSpan DefaultPublishingRecoveryThreshold = TimeSpan.FromMinutes(5);
    public const int MaxPublishAttempts = 10;

    private readonly string _connectionString;
    private readonly ILogger<OutboxStore> _log;

    public OutboxStore(string connectionString, ILogger<OutboxStore> log)
    {
        _connectionString = connectionString;
        _log = log;
    }

    public sealed record OutboxEventRow(string Id, string Type, string Payload, string TraceId, int PublishAttempts);

    public async Task<List<OutboxEventRow>> ClaimBatchAsync(int limit, CancellationToken ct = default)
    {
        if (limit <= 0) limit = DefaultBatchSize;

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        await using var cmd = new NpgsqlCommand("""
            WITH candidate AS (
                SELECT id
                FROM outbox_events
                WHERE processed_at IS NULL
                  AND publish_status IN ('pending', 'failed')
                  AND publish_attempts < $2
                ORDER BY created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE outbox_events AS o
            SET publish_status = 'publishing',
                publish_attempts = o.publish_attempts + 1,
                last_publish_attempt_at = now(),
                error = NULL,
                updated_at = now()
            FROM candidate
            WHERE o.id = candidate.id
            RETURNING o.id::text, o.type, o.payload::text, o.trace_id, o.publish_attempts
            """, conn, tx);
        cmd.Parameters.AddWithValue(limit);
        cmd.Parameters.AddWithValue(MaxPublishAttempts);

        var events = new List<OutboxEventRow>();
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                events.Add(new OutboxEventRow(
                    reader.GetString(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.IsDBNull(3) ? "" : reader.GetString(3),
                    reader.GetInt32(4)));
            }
        }

        await tx.CommitAsync(ct);
        return events;
    }

    /// <summary>
    /// Returns claimed-but-unfinished rows to 'pending'. These are events claimed by
    /// a worker that crashed after committing the claim but before finishing the publish.
    /// </summary>
    public async Task<int> RecoverStalePublishingAsync(int limit, TimeSpan publishingStaleAfter, CancellationToken ct = default)
    {
        if (limit <= 0) limit = DefaultBatchSize;
        var staleSeconds = Math.Max(0, (long)publishingStaleAfter.TotalSeconds);

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand("""
            WITH stale AS (
                SELECT id
                FROM outbox_events
                WHERE processed_at IS NULL
                  AND publish_status = 'publishing'
                  AND updated_at < now() - ($2::bigint * interval '1 second')
                ORDER BY updated_at ASC, created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE outbox_events AS o
            SET publish_status = 'pending',
                error = NULL,
                updated_at = now()
            FROM stale
            WHERE o.id = stale.id
            """, conn);
        cmd.Parameters.AddWithValue(limit);
        cmd.Parameters.AddWithValue(staleSeconds);

        return await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task MarkPublishedAsync(string eventId, CancellationToken ct = default)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand("""
            UPDATE outbox_events
            SET publish_status = 'published',
                processed_at = COALESCE(processed_at, now()),
                error = NULL,
                updated_at = now()
            WHERE id = $1::uuid
              AND publish_status <> 'published'
            """, conn);
        cmd.Parameters.AddWithValue(eventId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task MarkFailedAsync(string eventId, int publishAttempt, Exception? publishError, CancellationToken ct = default)
    {
        var message = publishError?.Message ?? "";

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand("""
            UPDATE outbox_events
            SET publish_status = 'failed',
                error = $3,
                updated_at = now()
            WHERE id = $1::uuid
              AND publish_status = 'publishing'
              AND publish_attempts = $2
            """, conn);
        cmd.Parameters.AddWithValue(eventId);
        cmd.Parameters.AddWithValue(publishAttempt);
        cmd.Parameters.AddWithValue(message);

        var affected = await cmd.ExecuteNonQueryAsync(ct);
        if (affected == 0)
            _log.LogWarning("outbox_store: mark failed affected zero rows event_id={EventId} attempt={Attempt} publish_error={Error}",
                eventId, publishAttempt, message);
    }
}
