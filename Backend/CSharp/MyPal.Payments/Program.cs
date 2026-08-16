using Microsoft.EntityFrameworkCore;
using MyPal.Payments.Data;
using MyPal.Payments.Data.Entities;
using MyPal.ServiceDefaults;

// MyPal Payments service — the wallet and its transaction ledger, on mypal_orders
// (shared with the Orders service, which owns orders/carts/notifications there).
//
// Split out of the former MyPal.API monolith. The endpoint bodies are the
// monolith's, unchanged. What changed around them:
//   - routes are published on their public /api/v1/... paths;
//   - the balance reads public.wallets rather than users.wallet_balance. Wallet
//     money is payments-owned data and users moved to mypal_auth, so the column
//     became a table here, next to the ledger that explains it;
//   - the welcome grant that signup used to seed is applied on first touch of a
//     wallet instead — see EnsureWalletAsync.

var builder = ServiceHost.CreateBuilder(args, "payments", defaultPort: 5005);

var connectionString = ServiceHost.ResolveConnectionString(builder.Configuration, "PAYMENTS", "mypal_orders");

builder.Services.AddDbContext<PaymentsDbContext>(options => options.UseNpgsql(connectionString));

var app = builder.Build();

app.UseForwardedHeaders();
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "MyPal Payments v1"));
app.UseServiceCors(builder.Configuration);
app.UseJwtValidation(builder.Configuration, ServiceHost.IsCommonAnonymousPath);

app.MapGet("/", async (PaymentsDbContext db) =>
{
    var dbOk = false;
    var dbError = "";
    try { dbOk = await db.Database.CanConnectAsync(); }
    catch (Exception ex) { dbError = ex.Message.Split('\n')[0]; }

    return Results.Json(new
    {
        service   = "MyPal Payments service",
        status    = dbOk ? "ok" : "degraded",
        version   = "1.0.0",
        database  = "mypal_orders (shared with orders)",
        postgres  = new { configured = !string.IsNullOrEmpty(connectionString), connected = dbOk, error = dbError.Length > 0 ? dbError : null },
        endpoints = new[]
        {
            "GET  /api/v1/wallet",
            "GET  /api/v1/wallet/transactions",
            "POST /api/v1/wallet/add-funds",
        }
    });
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "payments" }));

// ─── Wallet ────────────────────────────────────────────────────────────────

app.MapGet("/api/v1/wallet", async (HttpRequest req, PaymentsDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var wallet = await EnsureWalletAsync(db, caller.UserId);

    // Funds tied up in not-yet-completed orders are shown as "escrow".
    var escrow = await db.Orders
        .Where(o => o.UserId == caller.UserId && o.Status == "Pending")
        .SumAsync(o => (decimal?)o.WalletAmountUsed) ?? 0m;

    return Results.Ok(new
    {
        balance  = wallet.Balance,
        escrow,
        currency = "USD",
    });
});

app.MapGet("/api/v1/wallet/transactions", async (HttpRequest req, PaymentsDbContext db, int page = 1, int pageSize = 50) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    await EnsureWalletAsync(db, caller.UserId);

    if (page < 1) page = 1;
    if (pageSize is < 1 or > 100) pageSize = 50;

    var query = db.Transactions.Where(t => t.UserId == caller.UserId);
    var total = await query.CountAsync();
    var txns = await query
        .OrderByDescending(t => t.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(t => new
        {
            id         = t.Id,
            type       = t.Type,
            amount     = t.Amount,
            order_id   = t.OrderId,
            created_at = t.CreatedAt,
        })
        .ToListAsync();

    return Results.Ok(new { total, page, pageSize, transactions = txns });
});

// Adding funds is the only way money enters the wallet, and the only wallet
// write a user can initiate. There is deliberately no withdraw endpoint: MyPal
// wallet money is spendable in-app and never leaves it.
app.MapPost("/api/v1/wallet/add-funds", async (HttpRequest req, WalletAmountRequest body, PaymentsDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();
    if (body.Amount <= 0) return Results.BadRequest(new { error = "Amount must be greater than zero" });

    var wallet = await EnsureWalletAsync(db, caller.UserId);
    wallet.Balance += body.Amount;
    wallet.UpdatedAt = DateTime.UtcNow;

    // transactions.type CHECK allows only 'Purchase' | 'Refund' | 'AddFunds'
    // (plus the legacy 'Withdrawal', which nothing writes any more).
    db.Transactions.Add(new Transaction
    {
        Id        = Guid.NewGuid(),
        UserId    = caller.UserId,
        Type      = TransactionTypes.AddFunds,
        Amount    = body.Amount,
        CreatedAt = DateTime.UtcNow,
    });

    await db.SaveChangesAsync();
    return Results.Ok(new { balance = wallet.Balance });
});

app.Run();

// ─── Helpers ────────────────────────────────────────────────────────────────

/// <summary>
/// Returns the caller's wallet, creating it with the welcome grant if this is the
/// first time it has been touched.
///
/// Before the split, SeedWelcomeWallet ran inline during signup, because signup and
/// the wallet were the same database. Signup is now the Auth service's and the
/// wallet is here, so the grant is applied lazily instead of through a synchronous
/// cross-service write at registration. The user still finds 1000.00 waiting the
/// first time they look, and still gets exactly one AddFunds row for it.
/// </summary>
static async Task<Wallet> EnsureWalletAsync(PaymentsDbContext db, Guid userId)
{
    var wallet = await db.Wallets.FirstOrDefaultAsync(w => w.UserId == userId);
    if (wallet != null) return wallet;

    // Simulated starting funds. MyPal is a demo marketplace — wallet money is
    // fake but persisted in the DB so added funds and purchases behave for real.
    const decimal welcomeAmount = 1000.00m;

    wallet = new Wallet
    {
        UserId    = userId,
        Balance   = welcomeAmount,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };
    db.Wallets.Add(wallet);
    db.Transactions.Add(new Transaction
    {
        Id        = Guid.NewGuid(),
        UserId    = userId,
        Type      = TransactionTypes.AddFunds,
        Amount    = welcomeAmount,
        CreatedAt = DateTime.UtcNow,
    });

    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
        // Two concurrent first-touches raced for the same wallet; the PK on user_id
        // means exactly one wins. Re-read and use the winner's row.
        db.ChangeTracker.Clear();
        wallet = await db.Wallets.FirstAsync(w => w.UserId == userId);
    }

    return wallet;
}

// ─── Request records ────────────────────────────────────────────────────────

public record WalletAmountRequest(decimal Amount);

/// <summary>
/// The values allowed by the transactions.type CHECK constraint.
/// </summary>
public static class TransactionTypes
{
    /// <summary>Money added to the wallet, including the welcome grant.</summary>
    public const string AddFunds = "AddFunds";

    /// <summary>Wallet spend against an order. Written by the orders service.</summary>
    public const string Purchase = "Purchase";

    public const string Refund = "Refund";

    /// <summary>
    /// Legacy only. Withdrawing from the wallet was removed — money is spendable
    /// in-app and never leaves it — but rows predating that are kept under their
    /// true type rather than relabelled as added funds.
    /// </summary>
    public const string Withdrawal = "Withdrawal";
}
