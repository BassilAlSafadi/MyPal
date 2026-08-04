using System.Globalization;
using Microsoft.EntityFrameworkCore;
using MyPal.Orders.Data.Entities;
using MyPal.Orders.Data.Entities.Enums;

namespace MyPal.Orders.Data;

/// <summary>
/// The mypal_orders database: orders, carts, notifications, the event-sourcing
/// tables the checkout saga depends on, and — shared with the Payments service —
/// the wallets and transactions ledger.
///
/// Carved out of MyPalDbContext, configuration copied across verbatim. Payments
/// maps the same wallets/transactions tables from its own context; that shared
/// database is what keeps an order insert and its wallet debit in one transaction.
/// </summary>
public class OrdersDbContext : DbContext
{
    public OrdersDbContext(DbContextOptions<OrdersDbContext> options) : base(options)
    {
    }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Cart> Carts => Set<Cart>();
    public DbSet<CartItem> CartItems => Set<CartItem>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Wallet> Wallets => Set<Wallet>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<OutboxEvent> OutboxEvents => Set<OutboxEvent>();
    public DbSet<ProcessedEvent> ProcessedEvents => Set<ProcessedEvent>();
    public DbSet<SagaStateEntity> SagaStates => Set<SagaStateEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<OutboxEvent>()
            .ToTable("outbox_events", table =>
                table.HasCheckConstraint(
                    "CK_outbox_events_publish_status",
                    "publish_status IN ('pending', 'publishing', 'published', 'failed')"))
            .HasKey(x => x.Id);

        modelBuilder.Entity<OutboxEvent>()
            .Property(x => x.Payload)
            .HasColumnType("jsonb");

        modelBuilder.Entity<OutboxEvent>()
            .Property(x => x.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<OutboxEvent>()
            .Property(x => x.UpdatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<OutboxEvent>()
            .Property(x => x.PublishStatus)
            .HasDefaultValue("pending");

        modelBuilder.Entity<OutboxEvent>()
            .Property(x => x.PublishAttempts)
            .HasDefaultValue(0);

        modelBuilder.Entity<OutboxEvent>()
            .HasIndex(x => new { x.PublishStatus, x.CreatedAt })
            .HasDatabaseName("IX_outbox_events_publish_status_created_at");

        modelBuilder.Entity<ProcessedEvent>()
            .HasKey(x => new { x.EventId, x.Consumer });

        modelBuilder.Entity<SagaStateEntity>()
            .Property(x => x.RetryCount)
            .HasDefaultValue(0);

        modelBuilder.Entity<Cart>()
            .HasMany(x => x.CartItems)
            .WithOne(x => x.Cart)
            .HasForeignKey(x => x.CartId);

        modelBuilder.Entity<Order>()
            .HasMany(x => x.OrderItems)
            .WithOne(x => x.Order)
            .HasForeignKey(x => x.OrderId);

        modelBuilder.Entity<Transaction>()
            .HasOne(x => x.Order)
            .WithMany(x => x.Transactions)
            .HasForeignKey(x => x.OrderId);

        // orders.status has a CHECK constraint for PascalCase ('Pending','Paid',
        // 'Shipped','Delivered'). Lowercasing it makes every order INSERT fail with a
        // 23514 violation, so write the enum name as-is. The read side still
        // normalizes, so legacy/lowercase values parse fine.
        modelBuilder.Entity<Order>()
            .Property(x => x.Status)
            .HasConversion(
                v => v.HasValue ? v.Value.ToString() : null,
                v => string.IsNullOrWhiteSpace(v) ? (OrderStatus?)null : ParseEnum<OrderStatus>(v));

        // --- Order: PaymentMethod enum ---
        // SQL stores 'Wallet', 'COD', 'Split' (PascalCase / uppercase acronym).
        // The converter maps the C# enum to the exact DB strings so EF does not
        // silently lowercase them and break the CHECK constraint.
        modelBuilder.Entity<Order>()
            .Property(x => x.PaymentMethod)
            .HasConversion(
                v => v.HasValue ? PaymentMethodToDbString(v.Value) : null,
                v => string.IsNullOrWhiteSpace(v) ? (PaymentMethod?)null : DbStringToPaymentMethod(v));

        modelBuilder.Entity<Order>()
            .HasIndex(x => x.UserId)
            .HasDatabaseName("IX_orders_user_id");

        modelBuilder.Entity<Cart>()
            .HasIndex(x => x.UserId)
            .HasDatabaseName("IX_carts_user_id");

        modelBuilder.Entity<Notification>()
            .HasIndex(x => x.UserId)
            .HasDatabaseName("IX_notifications_user_id");

        modelBuilder.Entity<Transaction>()
            .HasIndex(x => x.UserId)
            .HasDatabaseName("IX_transactions_user_id");
    }

    private static TEnum? ParseEnum<TEnum>(string v) where TEnum : struct, Enum
    {
        var normalized = NormalizeDbEnumToken(v);
        return Enum.TryParse<TEnum>(normalized, ignoreCase: true, out var parsed) ? parsed : null;
    }

    private static string NormalizeDbEnumToken(string token)
    {
        // Supports common DB styles like "in_progress" / "in-progress" / "in progress".
        var parts = token
            .Trim()
            .Replace("-", "_", StringComparison.Ordinal)
            .Replace(" ", "_", StringComparison.Ordinal)
            .Split('_', StringSplitOptions.RemoveEmptyEntries);

        return string.Concat(parts.Select(p => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(p.ToLowerInvariant())));
    }

    /// <summary>
    /// Converts a <see cref="PaymentMethod"/> enum value to the exact string stored in the DB.
    /// 'COD' is an acronym and must stay uppercase to satisfy the Postgres CHECK constraint.
    /// </summary>
    private static string PaymentMethodToDbString(PaymentMethod method) => method switch
    {
        PaymentMethod.Wallet => "Wallet",
        PaymentMethod.Cod    => "COD",
        PaymentMethod.Split  => "Split",
        _                    => throw new ArgumentOutOfRangeException(nameof(method), method, null),
    };

    private static PaymentMethod DbStringToPaymentMethod(string value) => value switch
    {
        "Wallet" => PaymentMethod.Wallet,
        "COD"    => PaymentMethod.Cod,
        "Split"  => PaymentMethod.Split,
        _        => throw new ArgumentOutOfRangeException(nameof(value), value, $"Unknown payment_method: '{value}'"),
    };
}
