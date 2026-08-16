using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace MyPal.Orders.Messaging;

/// <summary>
/// NATS JetStream publisher. Port of Backend/Go/internal/gateway/messaging/nats.go.
///
/// The event bus is internal infrastructure for the transactional outbox, and the
/// outbox_events table is orders-owned, so it moved here with the dispatcher when
/// the gateway was retired. Stream names, subjects and headers are unchanged.
/// </summary>
public sealed class EventBus : IAsyncDisposable
{
    public const string HeaderTraceId = "X-Trace-ID";
    public const string HeaderCorrelationId = "X-Correlation-ID";
    public const string HeaderCausationId = "X-Causation-ID";
    public const string HeaderOutboxEventId = "X-Outbox-Event-ID";
    public const string HeaderEventType = "X-Event-Type";
    /// <summary>JetStream's own dedup header — the Go client calls it nats.MsgIdHdr.</summary>
    public const string HeaderMsgId = "Nats-Msg-Id";

    private readonly NatsConnection _connection;
    private readonly NatsJSContext _jetStream;
    private readonly ILogger<EventBus> _log;

    public EventBus(string url, ILogger<EventBus> log)
    {
        _log = log;
        _connection = new NatsConnection(new NatsOpts { Url = url });
        _jetStream = new NatsJSContext(_connection);
    }

    public bool IsConnected => _connection.ConnectionState == NatsConnectionState.Open;

    /// <summary>Scaffolds the necessary JetStream streams.</summary>
    public async Task SetupStreamsAsync(CancellationToken ct = default)
    {
        await EnsureStreamAsync("ORDERS", "order.>", ct);
        await EnsureStreamAsync("INVENTORY", "inventory.>", ct);
        await EnsureStreamAsync("CHECKOUT", "checkout.>", ct);

        // DLQ streams
        foreach (var name in new[] { "DLQ_ORDERS", "DLQ_INVENTORY", "DLQ_AI", "DLQ_CHECKOUT" })
            await EnsureStreamAsync(name, $"{name}.>", ct);

        _log.LogInformation("messaging: NATS JetStream and DLQ streams configured");
    }

    private async Task EnsureStreamAsync(string name, string subject, CancellationToken ct)
    {
        try
        {
            await _jetStream.CreateStreamAsync(new StreamConfig(name, [subject])
            {
                Storage = StreamConfigStorage.File, // Durable persistence
            }, ct);
        }
        catch (NatsJSApiException ex) when (ex.Error.ErrCode == 10058)
        {
            // Stream name already in use — the Go code ignores nats.ErrStreamNameAlreadyInUse too.
        }
    }

    /// <summary>
    /// Publishes a durable outbox event after the outbox claim transaction has
    /// committed. The outbox row ID is sent as the JetStream message ID so duplicate
    /// attempts are broker-idempotent while preserving the original event body.
    /// </summary>
    public async Task PublishOutboxAsync(OutboxPublishMessage message, CancellationToken ct = default)
    {
        var headers = new NatsHeaders();

        if (!string.IsNullOrEmpty(message.EventId))
        {
            headers[HeaderMsgId] = message.EventId;
            headers[HeaderOutboxEventId] = message.EventId;
        }
        if (!string.IsNullOrEmpty(message.EventType))
            headers[HeaderEventType] = message.EventType;
        if (!string.IsNullOrEmpty(message.TraceId))
        {
            headers[HeaderTraceId] = message.TraceId;
            headers[HeaderCorrelationId] = message.TraceId;
            headers[HeaderCausationId] = message.TraceId;
        }

        var ack = await _jetStream.PublishAsync(message.Subject, message.Data, headers: headers, cancellationToken: ct);
        ack.EnsureSuccess();
    }

    public async ValueTask DisposeAsync() => await _connection.DisposeAsync();
}

public sealed record OutboxPublishMessage(
    string EventId,
    string EventType,
    string Subject,
    byte[] Data,
    string TraceId);
