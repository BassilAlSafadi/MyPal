using System.Text;

namespace MyPal.Orders.Messaging;

/// <summary>
/// Polls outbox_events and publishes to NATS. Port of
/// Backend/Go/internal/gateway/messaging/outbox_worker.go, running as a hosted
/// service rather than a goroutine. The claim → publish → finalize sequence, the
/// per-phase timeouts and the batch error aggregation are unchanged.
/// </summary>
public sealed class OutboxWorker : BackgroundService
{
    private readonly OutboxStore _store;
    private readonly EventBus? _bus;
    private readonly ILogger<OutboxWorker> _log;
    private readonly TimeSpan _interval;
    private readonly int _batchSize = OutboxStore.DefaultBatchSize;
    private readonly TimeSpan _publishTimeout = TimeSpan.FromSeconds(30);
    private readonly TimeSpan _finalizeTimeout = TimeSpan.FromSeconds(5);

    public OutboxWorker(OutboxStore store, EventBus? bus, IConfiguration config, ILogger<OutboxWorker> log)
    {
        _store = store;
        _bus = bus;
        _log = log;
        _interval = TimeSpan.FromSeconds(
            double.TryParse(config["OUTBOX_INTERVAL_SECONDS"], out var s) ? s : 5);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_bus is null)
        {
            _log.LogInformation("outbox_worker: messaging disabled — dispatcher is off");
            return;
        }

        _log.LogInformation("outbox_worker: started dispatcher");

        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(CancellationToken.None))
        {
            // Process each batch with an independent bounded budget so a shutdown
            // request drains the batch in flight rather than tearing it in half.
            using var batchCts = new CancellationTokenSource(TimeSpan.FromMinutes(2));
            try
            {
                await ProcessBatchAsync(batchCts.Token);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "outbox_worker: batch processing failed");
            }

            if (stoppingToken.IsCancellationRequested)
            {
                _log.LogInformation("outbox_worker: shutting down after batch drain");
                return;
            }
        }
    }

    private async Task ProcessBatchAsync(CancellationToken ct)
    {
        var events = await _store.ClaimBatchAsync(_batchSize, ct);
        if (events.Count == 0) return;

        _log.LogInformation("outbox_worker: processing batch count={Count}", events.Count);

        var batchErrors = new List<string>();

        foreach (var e in events)
        {
            var subject = MapTypeToSubject(e.Type);

            Exception? publishError = null;
            try
            {
                using var publishCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                publishCts.CancelAfter(_publishTimeout);

                await _bus!.PublishOutboxAsync(
                    new OutboxPublishMessage(e.Id, e.Type, subject, Encoding.UTF8.GetBytes(e.Payload), e.TraceId),
                    publishCts.Token);
            }
            catch (Exception ex)
            {
                publishError = ex;
            }

            // Finalization must survive the batch budget expiring — otherwise a row
            // would be stranded in 'publishing' with no record of what happened.
            using var finalizeCts = new CancellationTokenSource(_finalizeTimeout);

            if (publishError is not null)
            {
                try
                {
                    await _store.MarkFailedAsync(e.Id, e.PublishAttempts, publishError, finalizeCts.Token);
                }
                catch (Exception markEx)
                {
                    _log.LogError(markEx, "outbox_worker: failed to persist publish failure event_id={EventId} trace_id={TraceId}", e.Id, e.TraceId);
                    batchErrors.Add($"{e.Id} mark failed: {markEx.Message}");
                    continue;
                }

                _log.LogWarning(publishError, "outbox_worker: publish failed event_id={EventId} trace_id={TraceId} attempt={Attempt}",
                    e.Id, e.TraceId, e.PublishAttempts);
                batchErrors.Add($"{e.Id} publish: {publishError.Message}");
                continue;
            }

            try
            {
                await _store.MarkPublishedAsync(e.Id, finalizeCts.Token);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "outbox_worker: failed to mark published event_id={EventId} trace_id={TraceId}", e.Id, e.TraceId);
                batchErrors.Add($"{e.Id} mark published: {ex.Message}");
                continue;
            }

            _log.LogInformation("outbox_worker: published event event_id={EventId} trace_id={TraceId} subject={Subject} attempt={Attempt}",
                e.Id, e.TraceId, subject, e.PublishAttempts);
        }

        if (batchErrors.Count > 0)
            throw new InvalidOperationException("outbox publish batch completed with errors: " + string.Join("; ", batchErrors));
    }

    private static string MapTypeToSubject(string eventType) => eventType switch
    {
        "order.created" => "order.created",
        "inventory.reserved" => "inventory.reserved",
        _ => $"system.{eventType}",
    };
}
