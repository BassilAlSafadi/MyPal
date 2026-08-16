using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MyPal.ServiceDefaults;

/// <summary>
/// The profile fields a non-Auth service occasionally needs but the access token
/// does not carry — today only the saved delivery location, which Orders snapshots
/// onto a new order, and the seller flag Listings flips on first listing.
///
/// Before the split these were plain reads off <c>db.Users</c> inside the same
/// database. The users table now lives in mypal_auth and is owned by the Auth
/// service, so the read became an HTTP call to Auth. Responses are cached on the
/// shared 5 hour policy.
/// </summary>
public sealed record UserProfile
{
    [JsonPropertyName("id")] public Guid Id { get; init; }
    [JsonPropertyName("email")] public string Email { get; init; } = "";
    [JsonPropertyName("first_name")] public string FirstName { get; init; } = "";
    [JsonPropertyName("last_name")] public string LastName { get; init; } = "";
    [JsonPropertyName("is_buyer")] public bool IsBuyer { get; init; }
    [JsonPropertyName("is_seller")] public bool IsSeller { get; init; }
    [JsonPropertyName("google_place_id")] public string? GooglePlaceId { get; init; }
    [JsonPropertyName("lat")] public double? Lat { get; init; }
    [JsonPropertyName("lng")] public double? Lng { get; init; }
    [JsonPropertyName("city")] public string? City { get; init; }
    [JsonPropertyName("state")] public string? State { get; init; }
    [JsonPropertyName("country")] public string? Country { get; init; }
}

public interface IIdentityClient
{
    /// <summary>Fetches the caller's profile from the Auth service. Null when Auth rejects the token.</summary>
    Task<UserProfile?> GetProfileAsync(string bearerToken, Guid userId, CancellationToken ct = default);

    /// <summary>Promotes the caller to seller. Called by Listings the first time a user lists a product.</summary>
    Task PromoteToSellerAsync(string bearerToken, Guid userId, CancellationToken ct = default);
}

public sealed class IdentityClient : IIdentityClient
{
    private readonly HttpClient _http;
    private readonly IServiceCache _cache;
    private readonly ILogger<IdentityClient> _log;
    private readonly string _internalToken;

    public IdentityClient(HttpClient http, IServiceCache cache, IConfiguration config, ILogger<IdentityClient> log)
    {
        _http = http;
        _cache = cache;
        _log = log;
        _internalToken = config["INTERNAL_SERVICE_TOKEN"] ?? "";
        _http.BaseAddress = new Uri(config["AUTH_SERVICE_URL"] ?? "http://localhost:5000");
        _http.Timeout = TimeSpan.FromSeconds(10);
    }

    public Task<UserProfile?> GetProfileAsync(string bearerToken, Guid userId, CancellationToken ct = default) =>
        _cache.GetOrSetAsync<UserProfile?>($"profile:{userId}", async () =>
        {
            try
            {
                using var request = Build(HttpMethod.Get, "/api/v1/users/me", bearerToken);
                using var response = await _http.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode)
                {
                    _log.LogWarning("Auth service returned {Status} for profile {UserId}", (int)response.StatusCode, userId);
                    return null;
                }
                return await response.Content.ReadFromJsonAsync<UserProfile>(ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Auth service unreachable while resolving profile {UserId}", userId);
                return null;
            }
        }, ct);

    public async Task PromoteToSellerAsync(string bearerToken, Guid userId, CancellationToken ct = default)
    {
        try
        {
            using var request = Build(HttpMethod.Post, "/api/v1/users/me/promote-seller", bearerToken);
            using var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
                _log.LogWarning("Auth service returned {Status} promoting {UserId} to seller", (int)response.StatusCode, userId);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Auth service unreachable while promoting {UserId} to seller", userId);
        }
        finally
        {
            // The cached profile now has a stale is_seller.
            await _cache.InvalidateAsync($"profile:{userId}");
        }
    }

    private HttpRequestMessage Build(HttpMethod method, string path, string bearerToken)
    {
        var request = new HttpRequestMessage(method, path);
        if (!string.IsNullOrEmpty(bearerToken))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        if (!string.IsNullOrEmpty(_internalToken))
            request.Headers.Add("X-Internal-Token", _internalToken);
        return request;
    }
}

public static class IdentityClientExtensions
{
    public static IServiceCollection AddIdentityClient(this IServiceCollection services)
    {
        services.AddHttpClient<IIdentityClient, IdentityClient>();
        return services;
    }

    /// <summary>Pulls the raw bearer token back off the request so it can be relayed to Auth.</summary>
    public static string BearerToken(this Microsoft.AspNetCore.Http.HttpRequest req)
    {
        var header = req.Headers.Authorization.FirstOrDefault();
        return header is not null && header.StartsWith("Bearer ", StringComparison.Ordinal)
            ? header["Bearer ".Length..].Trim()
            : "";
    }
}
