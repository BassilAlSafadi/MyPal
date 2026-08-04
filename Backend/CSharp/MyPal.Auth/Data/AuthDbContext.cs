using Microsoft.EntityFrameworkCore;
using MyPal.Auth.Data.Entities;

namespace MyPal.Auth.Data;

/// <summary>
/// The mypal_auth database: identity and the user-scoped preference tables that
/// hang off it. Carved out of MyPalDbContext; the configuration for these three
/// entities is copied across as-is.
/// </summary>
public class AuthDbContext : DbContext
{
    public AuthDbContext(DbContextOptions<AuthDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<UserAlgorithmSteering> UserAlgorithmSteerings => Set<UserAlgorithmSteering>();
    public DbSet<LifeTrackHistory> LifeTrackHistories => Set<LifeTrackHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // --- UserAlgorithmSteering ---
        // Composite PK: (user_id, sector_name). Declared via [PrimaryKey] on the entity.
        modelBuilder.Entity<UserAlgorithmSteering>()
            .HasOne(x => x.User)
            .WithMany(x => x.AlgorithmSteerings)
            .HasForeignKey(x => x.UserId);

        // weight_multiplier stored as numeric in Postgres but used as double in C#.
        // EF will handle the numeric<->double conversion automatically via Npgsql.
        modelBuilder.Entity<UserAlgorithmSteering>()
            .Property(x => x.WeightMultiplier)
            .HasColumnType("numeric");

        modelBuilder.Entity<LifeTrackHistory>()
            .HasOne(x => x.User)
            .WithMany(x => x.LifeTrackHistories)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<User>()
            .HasIndex(x => x.Email)
            .IsUnique()
            .HasDatabaseName("IX_users_email");
    }
}
