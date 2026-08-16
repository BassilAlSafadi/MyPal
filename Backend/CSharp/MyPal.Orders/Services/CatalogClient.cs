using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace MyPal.Orders.Services;

/// <summary>
/// Reads and writes the product rows an order depends on.
///
/// Before the split, order placement joined straight to public.products in the same
/// database: it read name/price/stock to price the order, then decremented stock in
/// the same transaction. products now lives in mypal_listings, so those two steps
/// became calls to the Listings service's internal endpoints.
/// </summary>
public interface ICatalogClient
{
    Task<Dictionary<Guid, CatalogProduct>> ResolveAsync(IEnumerable<Guid> productIds, CancellationToken ct = default);
    Task DecrementStockAsync(IEnumerable<(Guid ProductId, int Quantity)> items, CancellationToken ct = default);
}

public sealed record CatalogProduct(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("current_price")] decimal? CurrentPrice,
    [property: JsonPropertyName("stock_qty")] int? StockQty);

public sealed class CatalogClient : ICatalogClient
{
    private readonly HttpClient _http;
    private readonly ILogger<CatalogClient> _log;
    private readonly string _internalToken;

    public CatalogClient(HttpClient http, IConfiguration config, ILogger<CatalogClient> log)
    {
        _http = http;
        _log = log;
        _internalToken = config["INTERNAL_SERVICE_TOKEN"] ?? "";
        _http.BaseAddress = new Uri(config["LISTINGS_SERVICE_URL"] ?? "http://localhost:5002");
        _http.Timeout = TimeSpan.FromSeconds(15);
    }

    private sealed record ResolveResponse([property: JsonPropertyName("products")] List<CatalogProduct>? Products);

    public async Task<Dictionary<Guid, CatalogProduct>> ResolveAsync(IEnumerable<Guid> productIds, CancellationToken ct = default)
    {
        var ids = productIds.Distinct().ToList();
        if (ids.Count == 0) return [];

        using var request = Build(HttpMethod.Post, "/internal/products/resolve");
        request.Content = JsonContent.Create(new { product_ids = ids });

        using var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<ResolveResponse>(ct);
        return payload?.Products?.ToDictionary(p => p.Id) ?? [];
    }

    public async Task DecrementStockAsync(IEnumerable<(Guid ProductId, int Quantity)> items, CancellationToken ct = default)
    {
        var lines = items.Select(i => new { product_id = i.ProductId, quantity = i.Quantity }).ToList();
        if (lines.Count == 0) return;

        try
        {
            using var request = Build(HttpMethod.Post, "/internal/products/decrement-stock");
            request.Content = JsonContent.Create(new { items = lines });
            using var response = await _http.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            // The order is already committed at this point. Losing the stock decrement
            // is a drift the reconciliation worker's inventory job is meant to catch,
            // so log loudly rather than fail an order the customer has already paid for.
            _log.LogError(ex, "orders: stock decrement failed for {Count} lines — inventory drift", lines.Count);
        }
    }

    private HttpRequestMessage Build(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        if (!string.IsNullOrEmpty(_internalToken))
            request.Headers.Add("X-Internal-Token", _internalToken);
        return request;
    }
}
