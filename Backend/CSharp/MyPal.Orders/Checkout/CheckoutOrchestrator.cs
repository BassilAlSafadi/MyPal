using System.Text.Json;
using System.Text.Json.Serialization;
using MyPal.Orders.Saga;
using Npgsql;

namespace MyPal.Orders.Checkout;

/// <summary>
/// Coordinates the checkout saga. Port of Backend/Go/internal/gateway/checkout.
///
/// The gateway ran this only because it held the Postgres pool; orders,
/// saga_states, saga_steps and outbox_events are all orders-owned tables, so the
/// orchestration moved into this service intact. The step sequence, the
/// saga-state-before-order ordering, and the single-transaction commit are unchanged.
/// </summary>
public sealed class CheckoutOrchestrator
{
    private readonly SagaStore _sagaStore;
    private readonly ILogger<CheckoutOrchestrator> _log;

    public CheckoutOrchestrator(SagaStore sagaStore, ILogger<CheckoutOrchestrator> log)
    {
        _sagaStore = sagaStore;
        _log = log;
    }

    /// <summary>Enforces geo-integrity.</summary>
    public sealed record GeoSnapshot(
        [property: JsonPropertyName("lat")] double Lat,
        [property: JsonPropertyName("lng")] double Lng,
        [property: JsonPropertyName("google_place_id")] string? GooglePlaceId);

    public sealed record CheckoutRequest(
        [property: JsonPropertyName("buyer_id")] string? BuyerId,
        [property: JsonPropertyName("cart_id")] string? CartId,
        [property: JsonPropertyName("geo_snapshot")] GeoSnapshot? GeoSnapshot);

    public sealed record CheckoutResponse(
        [property: JsonPropertyName("parent_order_id")] string ParentOrderId,
        [property: JsonPropertyName("saga_id")] string SagaId,
        [property: JsonPropertyName("status")] string Status);

    /// <summary>Coordinates the multi-vendor checkout workflow.</summary>
    public async Task<CheckoutResponse> ProcessAsync(CheckoutRequest req, string traceId, CancellationToken ct = default)
    {
        _log.LogInformation("checkout: starting saga trace_id={TraceId} buyer_id={BuyerId}", traceId, req.BuyerId);

        var sagaId = Guid.NewGuid().ToString();

        // 1. Start Transaction
        await using var conn = _sagaStore.CreateConnection();
        await conn.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        // 2. Persist Authoritative Saga State FIRST
        var now = DateTime.UtcNow;
        var sagaState = new SagaState
        {
            Id = sagaId,
            CorrelationId = traceId,
            CausationId = traceId,
            CurrentStatus = SagaStatus.Processing,
            CurrentStep = "checkout.started",
            CreatedAt = now,
            UpdatedAt = now,
            TimeoutAt = now.AddMinutes(10),
        };
        var sagaStep = new SagaStep
        {
            Id = Guid.NewGuid().ToString(),
            SagaId = sagaId,
            StepName = "checkout.started",
            ExecutionOrder = 1,
            Status = SagaStepStatus.Started,
            Timestamp = now,
        };

        await _sagaStore.InitializeSagaAsync(conn, tx, sagaState, sagaStep, ct);

        // 3. Load Cart and Group by Vendor
        // Simulated for scope: in reality we'd query `carts` and `cart_items` and
        // resolve products through the listings service. Assume a group of items.

        // 4. Inventory Reservation — products live in mypal_listings now, so the
        // FOR UPDATE SKIP LOCKED reservation is performed by the listings service.

        // 5. Order Splitting & Parent/Child Generation
        var parentOrderId = Guid.NewGuid().ToString();
        var geoJson = JsonSerializer.Serialize(req.GeoSnapshot ?? new GeoSnapshot(0, 0, null));

        // Insert Parent Order
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO orders (id, user_id, total_amount, geo_snapshot, status, created_at, updated_at)
            VALUES ($1, $2, 0, $3, 'Pending', now(), now())
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue(Guid.Parse(parentOrderId));
            cmd.Parameters.AddWithValue(Guid.Parse(req.BuyerId!));
            cmd.Parameters.Add(new NpgsqlParameter { Value = geoJson, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Jsonb });
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 6. Outbox Insert for 'order.created'
        var outboxPayload = JsonSerializer.Serialize(new
        {
            order_id = parentOrderId,
            buyer_id = req.BuyerId,
            saga_id = sagaId,
        });

        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO outbox_events (id, type, payload, trace_id, created_at)
            VALUES ($1, 'order.created', $2, $3, now())
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue(Guid.NewGuid());
            cmd.Parameters.Add(new NpgsqlParameter { Value = outboxPayload, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Jsonb });
            cmd.Parameters.AddWithValue(traceId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 7. Log completion step and update saga state BEFORE commit
        await _sagaStore.LogStepAsync(conn, tx, new SagaStep
        {
            Id = Guid.NewGuid().ToString(),
            SagaId = sagaId,
            StepName = "checkout.order_created",
            ExecutionOrder = 2,
            Status = SagaStepStatus.Completed,
            Timestamp = DateTime.UtcNow,
        }, ct);

        await _sagaStore.CompleteSagaAsync(conn, tx, sagaId, ct);

        // 8. Commit Transaction
        await tx.CommitAsync(ct);

        _log.LogInformation("checkout: saga initialization completed durably trace_id={TraceId} saga_id={SagaId} parent_order_id={OrderId}",
            traceId, sagaId, parentOrderId);

        return new CheckoutResponse(parentOrderId, sagaId, "processing");
    }
}
