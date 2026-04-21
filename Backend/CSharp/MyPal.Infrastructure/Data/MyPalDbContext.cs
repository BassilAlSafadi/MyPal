using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using MyPal.Infrastructure.Data.Entities;
using MyPal.Infrastructure.Data.Entities.Enums;

namespace MyPal.Infrastructure.Data;

public class MyPalDbContext : DbContext
{
    public MyPalDbContext(DbContextOptions<MyPalDbContext> options) : base(options)
    {
    }

    public DbSet<Cart> Carts => Set<Cart>();
    public DbSet<CartItem> CartItems => Set<CartItem>();
    public DbSet<ExternalProduct> ExternalProducts => Set<ExternalProduct>();
    public DbSet<MyPalProduct> MyPalProducts => Set<MyPalProduct>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductAttribute> ProductAttributes => Set<ProductAttribute>();
    public DbSet<ProductReview> ProductReviews => Set<ProductReview>();
    public DbSet<SupportTicket> SupportTickets => Set<SupportTicket>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Vendor> Vendors => Set<Vendor>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Cart>()
            .HasMany(x => x.CartItems)
            .WithOne(x => x.Cart)
            .HasForeignKey(x => x.CartId);

        modelBuilder.Entity<Cart>()
            .HasOne(x => x.User)
            .WithMany(x => x.Carts)
            .HasForeignKey(x => x.UserId);

        modelBuilder.Entity<CartItem>()
            .HasOne(x => x.Product)
            .WithMany(x => x.CartItems)
            .HasForeignKey(x => x.ProductId);

        modelBuilder.Entity<Notification>()
            .HasOne(x => x.User)
            .WithMany(x => x.Notifications)
            .HasForeignKey(x => x.UserId);

        modelBuilder.Entity<Order>()
            .HasOne(x => x.User)
            .WithMany(x => x.Orders)
            .HasForeignKey(x => x.UserId);

        modelBuilder.Entity<Order>()
            .HasMany(x => x.OrderItems)
            .WithOne(x => x.Order)
            .HasForeignKey(x => x.OrderId);

        modelBuilder.Entity<OrderItem>()
            .HasOne(x => x.Product)
            .WithMany(x => x.OrderItems)
            .HasForeignKey(x => x.ProductId);

        modelBuilder.Entity<ProductAttribute>()
            .HasOne(x => x.Product)
            .WithMany(x => x.ProductAttributes)
            .HasForeignKey(x => x.ProductId);

        modelBuilder.Entity<ProductReview>()
            .HasOne(x => x.User)
            .WithMany(x => x.ProductReviews)
            .HasForeignKey(x => x.UserId);

        modelBuilder.Entity<ProductReview>()
            .HasOne(x => x.Product)
            .WithMany(x => x.ProductReviews)
            .HasForeignKey(x => x.ProductId);

        modelBuilder.Entity<ProductReview>()
            .HasOne(x => x.OrderItem)
            .WithMany(x => x.ProductReviews)
            .HasForeignKey(x => x.OrderItemId);

        modelBuilder.Entity<SupportTicket>()
            .HasOne(x => x.User)
            .WithMany(x => x.SupportTickets)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SupportTicket>()
            .HasOne(x => x.Product)
            .WithMany(x => x.SupportTickets)
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Transaction>()
            .HasOne(x => x.User)
            .WithMany(x => x.Transactions)
            .HasForeignKey(x => x.UserId);

        modelBuilder.Entity<Transaction>()
            .HasOne(x => x.Order)
            .WithMany(x => x.Transactions)
            .HasForeignKey(x => x.OrderId);

        modelBuilder.Entity<Vendor>()
            .HasOne(x => x.User)
            .WithMany(x => x.Vendors)
            .HasForeignKey(x => x.UserId);

        modelBuilder.Entity<ExternalProduct>()
            .HasOne(x => x.Vendor)
            .WithMany(x => x.ExternalProducts)
            .HasForeignKey(x => x.VendorId);

        modelBuilder.Entity<Product>()
            .HasOne(x => x.ExternalProduct)
            .WithOne(x => x.Product)
            .HasForeignKey<ExternalProduct>(x => x.ProductId);

        modelBuilder.Entity<Product>()
            .HasOne(x => x.MyPalProduct)
            .WithOne(x => x.Product)
            .HasForeignKey<MyPalProduct>(x => x.ProductId);

        modelBuilder.Entity<ExternalProduct>()
            .Property(x => x.ProductId)
            .ValueGeneratedNever();

        modelBuilder.Entity<MyPalProduct>()
            .Property(x => x.ProductId)
            .ValueGeneratedNever();

        modelBuilder.Entity<Order>()
            .Property(x => x.Status)
            .HasConversion(LowercaseEnumConverter<OrderStatus>());

        modelBuilder.Entity<Product>()
            .Property(x => x.Discriminator)
            .HasConversion(LowercaseEnumConverter<ProductDiscriminator>());

        modelBuilder.Entity<SupportTicket>()
            .Property(x => x.Status)
            .HasConversion(LowercaseEnumConverter<SupportTicketStatus>());

        modelBuilder.Entity<SupportTicket>()
            .Property(x => x.Priority)
            .HasConversion(LowercaseEnumConverter<SupportTicketPriority>());
    }

    private static ValueConverter<TEnum?, string?> LowercaseEnumConverter<TEnum>()
        where TEnum : struct, Enum
        => new(
            v => v.HasValue ? v.Value.ToString().ToLowerInvariant() : null,
            v =>
            {
                if (string.IsNullOrWhiteSpace(v)) return null;
                var normalized = NormalizeDbEnumToken(v);
                return Enum.TryParse<TEnum>(normalized, ignoreCase: true, out var parsed)
                    ? parsed
                    : null;
            });

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
}

