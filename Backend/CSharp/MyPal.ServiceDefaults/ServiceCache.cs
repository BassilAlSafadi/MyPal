using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace MyPal.ServiceDefaults;

/// <summary>
/// Per-service Redis read-through cache.
///
/// The TTL matches the Go side's <c>redisCacheTTL</c>
/// (Backend/Go/internal/repository/redis/cache_policy.go) so every microservice —
/// Go or C# — expires cached reads on the same 5 hour policy.
/// </summary>
public interface IServiceCache
{
    Task<T> GetOrSetAsync<T>(string key, Func<Task<T>> factory, CancellationToken ct = default);
    Task InvalidateAsync(params string[] keys);
}

public sealed class RedisServiceCache : IServiceCache, IAsyncDisposable
{
    /// <summary>5 hour TTL for every cached entry, per the shared cache policy.</summary>
    public static readonly TimeSpan Ttl = TimeSpan.FromHours(5);

    private readonly IConnectionMultiplexer? _redis;
    private readonly string _prefix;
    private readonly ILogger<RedisServiceCache> _log;

    public RedisServiceCache(IConfiguration config, ILogger<RedisServiceCache> log, string serviceName)
    {
        _log = log;
        _prefix = $"mypal:{serviceName}:";

        var url = config["REDIS_URL"];
        if (string.IsNullOrWhiteSpace(url))
        {
            _log.LogInformation("No REDIS_URL configured — {Service} cache disabled, reads go straight to the database", serviceName);
            return;
        }

        try
        {
            _redis = ConnectionMultiplexer.Connect(ToConfigurationString(url));
        }
        catch (Exception ex)
        {
            // A cache is an optimisation, never a dependency: if Redis is unreachable
            // the service still serves every request from its database.
            _log.LogWarning(ex, "Redis unavailable for {Service} — continuing without cache", serviceName);
        }
    }

    /// <summary>
    /// StackExchange.Redis wants "host:port", not a redis:// URL. Compose files and
    /// Render both hand us the URL form, so normalise it here.
    /// </summary>
    private static string ToConfigurationString(string url)
    {
        if (!url.Contains("://", StringComparison.Ordinal)) return url;

        var uri = new Uri(url);
        var options = new ConfigurationOptions
        {
            EndPoints = { { uri.Host, uri.Port <= 0 ? 6379 : uri.Port } },
            Ssl = uri.Scheme.Equals("rediss", StringComparison.OrdinalIgnoreCase),
            AbortOnConnectFail = false,
            ConnectTimeout = 3000,
        };

        var userInfo = uri.UserInfo.Split(':', 2);
        if (userInfo.Length == 2)
        {
            if (!string.IsNullOrEmpty(userInfo[0])) options.User = Uri.UnescapeDataString(userInfo[0]);
            options.Password = Uri.UnescapeDataString(userInfo[1]);
        }

        return options.ToString();
    }

    public async Task<T> GetOrSetAsync<T>(string key, Func<Task<T>> factory, CancellationToken ct = default)
    {
        var db = Database();
        if (db is null) return await factory();

        var fullKey = _prefix + key;

        try
        {
            var cached = await db.StringGetAsync(fullKey);
            if (cached.HasValue)
            {
                var hit = JsonSerializer.Deserialize<T>(cached!);
                if (hit is not null) return hit;
            }
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Cache read failed for {Key} — falling through to source", fullKey);
        }

        var value = await factory();

        try
        {
            if (value is not null)
                await db.StringSetAsync(fullKey, JsonSerializer.Serialize(value), Ttl);
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Cache write failed for {Key}", fullKey);
        }

        return value;
    }

    public async Task InvalidateAsync(params string[] keys)
    {
        var db = Database();
        if (db is null || keys.Length == 0) return;

        try
        {
            await db.KeyDeleteAsync(Array.ConvertAll(keys, k => (RedisKey)(_prefix + k)));
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Cache invalidation failed");
        }
    }

    private IDatabase? Database() =>
        _redis is { IsConnected: true } ? _redis.GetDatabase() : null;

    public async ValueTask DisposeAsync()
    {
        if (_redis is not null) await _redis.DisposeAsync();
    }
}

public static class ServiceCacheExtensions
{
    public static IServiceCollection AddServiceCache(this IServiceCollection services, string serviceName) =>
        services.AddSingleton<IServiceCache>(sp => new RedisServiceCache(
            sp.GetRequiredService<IConfiguration>(),
            sp.GetRequiredService<ILogger<RedisServiceCache>>(),
            serviceName));
}
