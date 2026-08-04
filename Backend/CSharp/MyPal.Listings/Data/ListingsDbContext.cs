using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using MyPal.Listings.Data.Entities;
using MyPal.Listings.Data.Entities.Enums;

namespace MyPal.Listings.Data;

/// <summary>
/// The mypal_listings database: the product catalogue and everything that hangs
/// off a product.
///
/// Carved out of MyPalDbContext. The configuration for these entities is copied
/// across verbatim; the only relationships dropped are the ones whose other side
/// now lives in a different database (users, order_items, cart_items,
/// support_tickets), which survive as plain ID columns.
/// </summary>
public class ListingsDbContext : DbContext
{
    public ListingsDbContext(DbContextOptions<ListingsDbContext> options) : base(options)
    {
    }

    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductAttribute> ProductAttributes => Set<ProductAttribute>();
    public DbSet<ProductMedia> ProductMedia => Set<ProductMedia>();
    public DbSet<ProductReview> ProductReviews => Set<ProductReview>();
    public DbSet<ProductValidationResult> ProductValidationResults => Set<ProductValidationResult>();
    public DbSet<SellerPerformanceSummary> SellerPerformanceSummaries => Set<SellerPerformanceSummary>();
    public DbSet<WishlistItem> WishlistItems => Set<WishlistItem>();
    public DbSet<Vendor> Vendors => Set<Vendor>();
    public DbSet<ExternalProduct> ExternalProducts => Set<ExternalProduct>();
    public DbSet<MyPalProduct> MyPalProducts => Set<MyPalProduct>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MyPalProduct>()
            .Property(p => p.SerialNumber)
            .HasColumnName("serial_number")
            .IsRequired(false); // Can be null if not yet assigned

        modelBuilder.Entity<MyPalProduct>()
            .Property(p => p.AuthenticityStatus)
            .HasColumnName("authenticity_status")
            .HasDefaultValue("pending")
            .IsRequired();

        modelBuilder.Entity<MyPalProduct>()
            .Property(p => p.LastVerifiedAt)
            .HasColumnName("last_verified_at")
            .HasColumnType("timestamp without time zone")
            .IsRequired(false);

        modelBuilder.Entity<ProductAttribute>()
            .HasOne(x => x.Product)
            .WithMany(x => x.ProductAttributes)
            .HasForeignKey(x => x.ProductId);

        modelBuilder.Entity<ProductReview>()
            .HasOne(x => x.Product)
            .WithMany(x => x.ProductReviews)
            .HasForeignKey(x => x.ProductId);

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

        modelBuilder.Entity<Product>()
            .Property(x => x.Discriminator)
            .HasConversion(LowercaseEnumConverter<ProductDiscriminator>());

        // --- ProductMedia ---
        modelBuilder.Entity<ProductMedia>()
            .HasOne(x => x.Product)
            .WithMany(x => x.ProductMedia)
            .HasForeignKey(x => x.ProductId);

        modelBuilder.Entity<ProductValidationResult>()
            .HasOne<Product>()
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.SetNull);

        // --- WishlistItem: one row per (user, product) ---
        modelBuilder.Entity<WishlistItem>()
            .HasOne(x => x.Product)
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<WishlistItem>()
            .HasIndex(x => new { x.UserId, x.ProductId })
            .IsUnique()
            .HasDatabaseName("IX_wishlist_items_user_product");
    }

    private static ValueConverter<TEnum?, string?> LowercaseEnumConverter<TEnum>()
        where TEnum : struct, Enum
        => new(
            v => v.HasValue ? v.Value.ToString().ToLowerInvariant() : null,
            v => string.IsNullOrWhiteSpace(v) ? (TEnum?)null : ParseEnum<TEnum>(v));

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
}
