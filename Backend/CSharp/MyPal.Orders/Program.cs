using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using MyPal.Orders.Checkout;
using MyPal.Orders.Data;
using MyPal.Orders.Data.Entities;
using MyPal.Orders.Data.Entities.Enums;
using MyPal.Orders.Messaging;
using MyPal.Orders.Middleware;
using MyPal.Orders.Saga;
using MyPal.Orders.Services;
using MyPal.ServiceDefaults;

// MyPal Orders service — orders, carts and notifications, on mypal_orders
// (shared with Payments, which owns wallets and transactions in the same database).
//
// Split out of the former MyPal.API monolith, and it also absorbed what the Go
// gateway used to run against these tables: the checkout saga, the transactional
// outbox dispatcher, the reconciliation worker and the Idempotency-Key middleware.
//
// The endpoint bodies are the monolith's, unchanged. What changed around them:
//   - routes are published on their public /api/v1/... paths;
//   - product name/price/stock come from the Listings service instead of a join,
//     since products moved to mypal_listings;
//   - the user's saved delivery address comes from the Auth service for the same reason;
//   - the wallet debit writes public.wallets rather than users.wallet_balance —
//     still in the same transaction as the order, which is what the shared database buys.

var builder = ServiceHost.CreateBuilder(args, "orders", defaultPort: 5004);

var connectionString = ServiceHost.ResolveConnectionString(builder.Configuration, "ORDERS", "mypal_orders");

builder.Services.AddDbContext<OrdersDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddIdentityClient();
builder.Services.AddHttpClient<ICatalogClient, CatalogClient>();
builder.Services.AddSingleton(sp => new SagaStore(connectionString));
builder.Services.AddSingleton(sp => new OutboxStore(connectionString, sp.GetRequiredService<ILogger<OutboxStore>>()));
builder.Services.AddScoped<CheckoutOrchestrator>();

// NATS is optional: with no URL configured the dispatcher stays off and the outbox
// simply accumulates, exactly as the gateway behaved with messaging disabled.
var natsUrl = builder.Configuration["NATS_URL"];
if (!string.IsNullOrWhiteSpace(natsUrl))
    builder.Services.AddSingleton(sp => new EventBus(natsUrl, sp.GetRequiredService<ILogger<EventBus>>()));

builder.Services.AddHostedService(sp => new OutboxWorker(
    sp.GetRequiredService<OutboxStore>(),
    sp.GetService<EventBus>(),
    sp.GetRequiredService<IConfiguration>(),
    sp.GetRequiredService<ILogger<OutboxWorker>>()));

builder.Services.AddHostedService(sp => new ReconciliationWorker(
    sp.GetRequiredService<OutboxStore>(),
    sp.GetRequiredService<IConfiguration>(),
    sp.GetRequiredService<ILogger<ReconciliationWorker>>(),
    connectionString));

var app = builder.Build();

if (!string.IsNullOrWhiteSpace(natsUrl))
{
    var bus = app.Services.GetService<EventBus>();
    if (bus is not null)
    {
        try { await bus.SetupStreamsAsync(); }
        catch (Exception ex) { app.Logger.LogError(ex, "orders: failed to setup NATS streams"); }
    }
}

app.UseForwardedHeaders();
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "MyPal Orders v1"));
app.UseServiceCors(builder.Configuration);
// Service-to-service routes authenticate with the shared internal token, not a
// user's access token, so they run ahead of — and are exempt from — JWT validation.
app.UseInternalAuth();
app.UseJwtValidation(builder.Configuration, path =>
    ServiceHost.IsCommonAnonymousPath(path) || path.StartsWithSegments("/internal"));
app.UseMiddleware<IdempotencyMiddleware>(connectionString);

app.MapGet("/", async (OrdersDbContext db) =>
{
    var dbOk = false;
    var dbError = "";
    try { dbOk = await db.Database.CanConnectAsync(); }
    catch (Exception ex) { dbError = ex.Message.Split('\n')[0]; }

    return Results.Json(new
    {
        service   = "MyPal Orders service",
        status    = dbOk ? "ok" : "degraded",
        version   = "1.0.0",
        database  = "mypal_orders",
        postgres  = new { configured = !string.IsNullOrEmpty(connectionString), connected = dbOk, error = dbError.Length > 0 ? dbError : null },
        endpoints = new[]
        {
            "GET  /api/v1/orders", "GET /api/v1/orders/{id}", "POST /api/v1/orders",
            "GET  /api/v1/cart", "POST /api/v1/cart/items", "DELETE /api/v1/cart/items/{productId}",
            "GET  /api/v1/notifications", "PATCH /api/v1/notifications/{id}/read",
            "POST /api/v1/checkout/orchestrate", "GET /api/v1/sagas/{saga_id}/status",
        }
    });
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "orders" }));

// ─── Orders ─────────────────────────────────────────────────────────────────

app.MapGet("/api/v1/orders", async (HttpRequest req, OrdersDbContext db, int page = 1, int pageSize = 20) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    if (page < 1) page = 1;
    if (pageSize is < 1 or > 100) pageSize = 20;

    var total = await db.Orders.CountAsync(o => o.UserId == caller.UserId);
    var orders = await db.Orders
        .Where(o => o.UserId == caller.UserId)
        .Include(o => o.OrderItems)
        .OrderByDescending(o => o.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .ToListAsync();

    return Results.Ok(new { total, page, pageSize, orders = orders.Select(ToOrderResponse) });
});

app.MapGet("/api/v1/orders/{id:guid}", async (Guid id, HttpRequest req, OrdersDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var order = await db.Orders
        .Include(o => o.OrderItems)
        .FirstOrDefaultAsync(o => o.Id == id && o.UserId == caller.UserId);

    if (order == null) return Results.NotFound(new { error = "Order not found" });
    return Results.Ok(ToOrderResponse(order));
});

app.MapPost("/api/v1/orders", async (
    HttpRequest req,
    CreateOrderRequest body,
    OrdersDbContext db,
    ICatalogClient catalog,
    IIdentityClient identity,
    CancellationToken ct) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    if (body.Items == null || body.Items.Count == 0)
        return Results.BadRequest(new { error = "Order must contain at least one item" });

    // Validate products, check stock, and sum total. The catalogue lives in
    // mypal_listings, so the rows are fetched from the listings service rather
    // than joined; the validation rules below are unchanged.
    var catalogue = await catalog.ResolveAsync(body.Items.Select(i => i.ProductId), ct);

    decimal total = 0m;
    var orderItems = new List<OrderItem>();
    var purchasedProducts = new List<(Guid ProductId, int Quantity)>();
    foreach (var item in body.Items)
    {
        if (!catalogue.TryGetValue(item.ProductId, out var product))
            return Results.BadRequest(new { error = $"Product {item.ProductId} not found" });
        if (item.Quantity <= 0)
            return Results.BadRequest(new { error = "Quantity must be > 0" });
        // Enforce stock when the product tracks it (null = untracked/unlimited).
        if (product.StockQty.HasValue && product.StockQty.Value < item.Quantity)
            return Results.BadRequest(new { error = $"Insufficient stock for {product.Name}: {product.StockQty} left" });

        var price = product.CurrentPrice ?? 0m;
        total += price * item.Quantity;
        purchasedProducts.Add((product.Id, item.Quantity));
        orderItems.Add(new OrderItem
        {
            Id               = Guid.NewGuid(),
            ProductId        = product.Id,
            ProductName      = product.Name,
            Quantity         = item.Quantity,
            PriceAtPurchase  = price,
            CreatedAt        = DateTime.UtcNow,
        });
    }

    // Destination falls back to the user's saved address, which the Auth service owns.
    var profile = body.DestinationGooglePlaceId is null || body.DestinationLat is null || body.DestinationLng is null
        ? await identity.GetProfileAsync(req.BearerToken(), caller.UserId, ct)
        : null;

    var order = new Order
    {
        Id                       = Guid.NewGuid(),
        UserId                   = caller.UserId,
        Status                   = OrderStatus.Pending,
        TotalAmount              = total,
        PaymentMethod            = body.PaymentMethod,
        WalletAmountUsed         = body.WalletAmountUsed ?? 0m,
        CodAmountDue             = body.CodAmountDue     ?? 0m,
        DestinationGooglePlaceId = body.DestinationGooglePlaceId ?? profile?.GooglePlaceId,
        DestinationLat           = body.DestinationLat   ?? profile?.Lat,
        DestinationLng           = body.DestinationLng   ?? profile?.Lng,
        DestinationAddress       = body.DestinationAddress,
        CreatedAt                = DateTime.UtcNow,
        UpdatedAt                = DateTime.UtcNow,
    };

    foreach (var item in orderItems)
        item.OrderId = order.Id;

    await using var tx = await db.Database.BeginTransactionAsync(ct);

    db.Orders.Add(order);
    db.OrderItems.AddRange(orderItems);
    await db.SaveChangesAsync(ct);

    // The BEFORE-INSERT process_wallet_payment trigger recomputes wallet_amount_used,
    // cod_amount_due, payment_method and debits public.wallets. Reload so the in-memory
    // entity (and the response) reflect the authoritative trigger-set values.
    await db.Entry(order).ReloadAsync(ct);

    // Record the wallet spend in the ledger so balance and transaction history agree.
    // transactions and wallets are payments-owned tables that live in this same
    // database, which is what keeps this write inside the order's transaction.
    var walletSpent = order.WalletAmountUsed;
    if (walletSpent > 0)
    {
        db.Transactions.Add(new Transaction
        {
            Id        = Guid.NewGuid(),
            UserId    = caller.UserId,
            Type      = "Purchase",
            Amount    = -walletSpent,
            OrderId   = order.Id,
            CreatedAt = DateTime.UtcNow,
        });
    }

    // Clear the cart atomically with the order so the frontend sees an empty cart
    var cart = await db.Carts.Include(c => c.CartItems)
        .FirstOrDefaultAsync(c => c.UserId == caller.UserId, ct);
    if (cart != null)
    {
        db.CartItems.RemoveRange(cart.CartItems);
        db.Carts.Remove(cart);
    }

    await db.SaveChangesAsync(ct);
    await tx.CommitAsync(ct);

    // Decrement stock for tracked products. Cross-database now, so it happens
    // after the commit rather than inside it.
    await catalog.DecrementStockAsync(purchasedProducts, ct);

    order.OrderItems = orderItems;
    return Results.Created($"/api/v1/orders/{order.Id}", ToOrderResponse(order));
});

// ─── Cart ──────────────────────────────────────────────────────────────────

app.MapGet("/api/v1/cart", async (HttpRequest req, OrdersDbContext db, ICatalogClient catalog, CancellationToken ct) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var cart = await db.Carts
        .Include(c => c.CartItems)
        .FirstOrDefaultAsync(c => c.UserId == caller.UserId, ct);

    if (cart == null) return Results.Ok(new { items = Array.Empty<object>(), total = 0m });

    // Hydrate the product details from the listings service — cart_items only
    // carries product_id now that products live in another database.
    var catalogue = await catalog.ResolveAsync(
        cart.CartItems.Where(i => i.ProductId.HasValue).Select(i => i.ProductId!.Value), ct);

    var items = cart.CartItems.Select(i =>
    {
        CatalogProduct? product = null;
        if (i.ProductId.HasValue) catalogue.TryGetValue(i.ProductId.Value, out product);

        return new
        {
            id         = i.Id,
            product_id = i.ProductId,
            product    = product == null ? null : new
            {
                id            = product.Id,
                name          = product.Name,
                current_price = product.CurrentPrice,
                stock_qty     = product.StockQty,
            },
            quantity   = i.Quantity,
        };
    }).ToList();

    var cartTotal = cart.CartItems.Sum(i =>
    {
        CatalogProduct? product = null;
        if (i.ProductId.HasValue) catalogue.TryGetValue(i.ProductId.Value, out product);
        return (product?.CurrentPrice ?? 0m) * (i.Quantity ?? 1);
    });

    return Results.Ok(new { cart_id = cart.Id, items, total = cartTotal });
});

app.MapPost("/api/v1/cart/items", async (HttpRequest req, AddCartItemRequest body, OrdersDbContext db, ICatalogClient catalog, CancellationToken ct) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var catalogue = await catalog.ResolveAsync([body.ProductId], ct);
    if (!catalogue.ContainsKey(body.ProductId)) return Results.NotFound(new { error = "Product not found" });

    var cart = await db.Carts.Include(c => c.CartItems)
        .FirstOrDefaultAsync(c => c.UserId == caller.UserId, ct);

    if (cart == null)
    {
        cart = new Cart { Id = Guid.NewGuid(), UserId = caller.UserId };
        db.Carts.Add(cart);
    }

    var existing = cart.CartItems.FirstOrDefault(i => i.ProductId == body.ProductId);
    if (existing != null)
    {
        existing.Quantity = (existing.Quantity ?? 0) + (body.Quantity > 0 ? body.Quantity : 1);
    }
    else
    {
        db.CartItems.Add(new CartItem
        {
            Id        = Guid.NewGuid(),
            CartId    = cart.Id,
            ProductId = body.ProductId,
            Quantity  = body.Quantity > 0 ? body.Quantity : 1,
        });
    }

    await db.SaveChangesAsync(ct);
    return Results.Ok(new { ok = true });
});

app.MapDelete("/api/v1/cart/items/{productId:guid}", async (Guid productId, HttpRequest req, OrdersDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var cart = await db.Carts.Include(c => c.CartItems)
        .FirstOrDefaultAsync(c => c.UserId == caller.UserId);

    if (cart == null) return Results.NotFound(new { error = "Cart not found" });

    var item = cart.CartItems.FirstOrDefault(i => i.ProductId == productId);
    if (item == null) return Results.NotFound(new { error = "Item not in cart" });

    db.CartItems.Remove(item);
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
});

// ─── Notifications ──────────────────────────────────────────────────────────

app.MapGet("/api/v1/notifications", async (HttpRequest req, OrdersDbContext db, bool unreadOnly = false) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var query = db.Notifications.Where(n => n.UserId == caller.UserId);
    if (unreadOnly) query = query.Where(n => n.IsRead != true);

    var notifications = await query
        .OrderByDescending(n => n.CreatedAt)
        .Take(50)
        .ToListAsync();

    return Results.Ok(new { notifications });
});

app.MapPatch("/api/v1/notifications/{id:guid}/read", async (Guid id, HttpRequest req, OrdersDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var notification = await db.Notifications
        .FirstOrDefaultAsync(n => n.Id == id && n.UserId == caller.UserId);
    if (notification == null) return Results.NotFound();

    notification.IsRead = true;
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
});

// ─── Internal reads for the AI service ───────────────────────────────────────
//
// The Node orchestrator joined order_items to products to work out what a user
// had bought, for its recommendation persona. orders is orders-owned and the AI
// service is on MongoDB now, so it reads the history through here. The product
// name comes from the order_items snapshot rather than a cross-database join.

app.MapGet("/internal/users/{userId:guid}/purchases", async (Guid userId, OrdersDbContext db) =>
{
    var items = await db.OrderItems
        .Where(i => i.Order != null && i.Order.UserId == userId && i.ProductName != null)
        .OrderByDescending(i => i.Order!.CreatedAt)
        .Take(10)
        .Select(i => new { name = i.ProductName!, category = (string?)null })
        .ToListAsync();

    return Results.Ok(new { items });
});

// ─── Checkout saga ──────────────────────────────────────────────────────────

app.MapPost("/api/v1/checkout/orchestrate", async (
    HttpRequest req,
    CheckoutOrchestrator.CheckoutRequest body,
    CheckoutOrchestrator orchestrator,
    ILoggerFactory loggerFactory,
    CancellationToken ct) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var traceId = req.Headers["X-Trace-ID"].FirstOrDefault() ?? Guid.NewGuid().ToString();

    // The authenticated identity always wins over a client-supplied buyer_id.
    var request = body with { BuyerId = caller.UserId.ToString() };
    if (string.IsNullOrEmpty(request.CartId))
        return Results.BadRequest(new { error = "buyer and cart are required" });

    try
    {
        return Results.Ok(await orchestrator.ProcessAsync(request, traceId, ct));
    }
    catch (Exception ex)
    {
        loggerFactory.CreateLogger("checkout").LogError(ex, "checkout: orchestration failed trace_id={TraceId}", traceId);
        return Results.Json(new { error = "internal_server_error" }, statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapGet("/api/v1/sagas/{saga_id}/status", async (string saga_id, SagaStore store, CancellationToken ct) =>
{
    if (string.IsNullOrEmpty(saga_id))
        return Results.BadRequest(new { error = "saga id is required" });

    var status = await store.GetStatusAsync(saga_id, ct);
    return status is null
        ? Results.NotFound(new { error = "saga not found" })
        : Results.Ok(status);
});

app.Run();

// ─── Helpers ────────────────────────────────────────────────────────────────

static object ToOrderResponse(Order o) => new
{
    id              = o.Id,
    status          = o.Status?.ToString().ToLowerInvariant(),
    total_amount    = o.TotalAmount,
    payment_method  = o.PaymentMethod?.ToString(),
    wallet_amount_used = o.WalletAmountUsed,
    cod_amount_due  = o.CodAmountDue,
    destination     = new
    {
        google_place_id = o.DestinationGooglePlaceId,
        lat     = o.DestinationLat,
        lng     = o.DestinationLng,
        address = o.DestinationAddress,
    },
    items = o.OrderItems.Select(i => new
    {
        id               = i.Id,
        product_id       = i.ProductId,
        // Snapshotted at purchase time — products are in mypal_listings now.
        product_name     = i.ProductName,
        quantity         = i.Quantity,
        price_at_purchase = i.PriceAtPurchase,
    }),
    created_at = o.CreatedAt,
    updated_at = o.UpdatedAt,
};

// ─── Request / Response records ─────────────────────────────────────────────

public record OrderLineItem(Guid ProductId, int Quantity);

public record CreateOrderRequest(
    List<OrderLineItem> Items,
    PaymentMethod? PaymentMethod,
    decimal? WalletAmountUsed,
    decimal? CodAmountDue,
    string? DestinationGooglePlaceId,
    double? DestinationLat,
    double? DestinationLng,
    string? DestinationAddress);

public record AddCartItemRequest(Guid ProductId, int Quantity);
