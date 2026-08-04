using Npgsql;

namespace MyPal.Orders.Messaging;

/// <summary>
/// Background repair of system-state inconsistencies. Port of
/// Backend/Go/internal/gateway/messaging/reconciliation_worker.go — the same three
/// jobs, the same thresholds, now scoped to the mypal_orders database that owns
/// all three tables it touches.
/// </summary>
public sealed class ReconciliationWorker : BackgroundService
{
    private readonly OutboxStore _outboxRecovery;
    private readonly string _connectionString;
    private readonly ILogger<ReconciliationWorker> _log;
    private readonly TimeSpan _interval;
    private readonly int _outboxRecoveryBatchSize = OutboxStore.DefaultBatchSize;
    private readonly TimeSpan _publishingRecoveryAfter = OutboxStore.DefaultPublishingRecoveryThreshold;

    public ReconciliationWorker(OutboxStore outboxRecovery, IConfiguration config, ILogger<ReconciliationWorker> log, string connectionString)
    {
        _outboxRecovery = outboxRecovery;
        _connectionString = connectionString;
        _log = log;
        _interval = TimeSpan.FromSeconds(
            double.TryParse(config["RECONCILIATION_INTERVAL_SECONDS"], out var s) ? s : 60);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("reconciliation_worker: started");

        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            if (stoppingToken.IsCancellationRequested)
            {
                _log.LogInformation("reconciliation_worker: shutting down");
                return;
            }

            _log.LogInformation("reconciliation_worker: running health checks");

            await RecoverStuckOutboxEventsAsync(stoppingToken);
            await CleanupStaleSagasAsync(stoppingToken);
            await CleanupStaleApiIdempotencyAsync(stoppingToken);
            // Additional jobs: orphan reservation cleanup, inventory drift detection.
        }
    }

    private async Task RecoverStuckOutboxEventsAsync(CancellationToken ct)
    {
        try
        {
            // Recover events claimed by a worker that crashed after committing the claim
            // but before completing the NATS publish/finalization phase.
            var recovered = await _outboxRecovery.RecoverStalePublishingAsync(
                _outboxRecoveryBatchSize, _publishingRecoveryAfter, ct);

            if (recovered > 0)
                _log.LogWarning("reconciliation_worker: recovered stale publishing outbox events count={Count} stale_after_ms={Ms}",
                    recovered, (long)_publishingRecoveryAfter.TotalMilliseconds);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "reconciliation_worker: failed to recover outbox events");
        }
    }

    private async Task CleanupStaleSagasAsync(CancellationToken ct)
    {
        // Transition sagas stuck in PROCESSING for > 10 minutes to FAILED to trigger compensations.
        var affected = await ExecuteAsync("""
            UPDATE saga_states
            SET status = 'FAILED', updated_at = now()
            WHERE status = 'PROCESSING'
              AND updated_at < now() - interval '10 minutes'
            """, "clean up stale sagas", ct);

        if (affected > 0)
            _log.LogWarning("reconciliation_worker: marked stale sagas as failed count={Count}", affected);
    }

    private async Task CleanupStaleApiIdempotencyAsync(CancellationToken ct)
    {
        var affected = await ExecuteAsync("""
            DELETE FROM api_idempotency
            WHERE status = 'IN_PROGRESS'
              AND updated_at < now() - interval '30 minutes'
            """, "clean stale api idempotency rows", ct);

        if (affected > 0)
            _log.LogWarning("reconciliation_worker: removed stale in-progress idempotency locks count={Count}", affected);
    }

    private async Task<int> ExecuteAsync(string sql, string description, CancellationToken ct)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = new NpgsqlCommand(sql, conn);
            return await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "reconciliation_worker: failed to {Description}", description);
            return 0;
        }
    }
}
