using Microsoft.EntityFrameworkCore;
using MyPal.Payments.Data.Entities;

namespace MyPal.Payments.Data;

/// <summary>
/// Payments' view of mypal_orders — the database it shares with the Orders service.
///
/// It owns public.wallets and public.transactions, and reads public.orders to
/// compute escrow. Because the schema for this database is created by the Orders
/// service's migrations (which own the whole file), this context is
/// migration-free: it maps the tables, it does not create them.
/// </summary>
public class PaymentsDbContext : DbContext
{
    public PaymentsDbContext(DbContextOptions<PaymentsDbContext> options) : base(options)
    {
    }

    public DbSet<Wallet> Wallets => Set<Wallet>();
    public DbSet<Transaction> Transactions => Set<Transaction>();

    /// <summary>Read-only. Used solely for the escrow sum on the balance endpoint.</summary>
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Order>()
            .ToTable("orders", "public", t => t.ExcludeFromMigrations());

        modelBuilder.Entity<Transaction>()
            .HasIndex(x => x.UserId)
            .HasDatabaseName("IX_transactions_user_id");
    }
}
