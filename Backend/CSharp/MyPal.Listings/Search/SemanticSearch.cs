using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Npgsql;

namespace MyPal.Listings.Search;

/// <summary>
/// Semantic search orchestration:
///
///     Frontend → SSQL check → ProdBERT /embed
///     → PostgreSQL pgvector cosine search → hybrid ranking → explainability → response
///
/// Port of Backend/Go/internal/gateway/search. It was orchestrated by the gateway
/// because the gateway held the Postgres pool; product_embeddings and products are
/// listings-owned tables, so the orchestration moved into this service. The
/// degraded-mode behaviour (embed failure, DB failure, no DB) is preserved exactly.
/// </summary>
public sealed class SemanticSearch
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<SemanticSearch> _log;
    private readonly string _connectionString;

    public SemanticSearch(HttpClient http, IConfiguration config, ILogger<SemanticSearch> log, string connectionString)
    {
        _http = http;
        _config = config;
        _log = log;
        _connectionString = connectionString;
        _http.Timeout = TimeSpan.FromSeconds(
            double.TryParse(config["PRODBERT_TIMEOUT_SECONDS"], out var t) ? t : 15);
    }

    public sealed record SearchRequest(
        [property: JsonPropertyName("q")] string? Query,
        [property: JsonPropertyName("limit")] int Limit = 0,
        [property: JsonPropertyName("offset")] int Offset = 0);

    public sealed record SearchResponse(
        string query,
        int total,
        List<Ranking.RankedResult> results,
        string mode,
        string trace_id,
        Dictionary<string, long> latency_ms);

    public async Task<SearchResponse> ExecuteAsync(string query, int limit, CancellationToken ct = default)
    {
        var traceId = Guid.NewGuid().ToString();
        var timings = new Dictionary<string, long>();
        if (limit <= 0 || limit > 50) limit = 20;

        _log.LogInformation("search: start query={Query} limit={Limit}", query, limit);
        var total = Stopwatch.StartNew();

        // ── Step 1: Embed query via ProdBERT ───────────────────────────
        var embedWatch = Stopwatch.StartNew();
        double[]? embedding;
        try
        {
            embedding = await EmbedQueryAsync(query, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "search: embedding failed, entering degraded mode");
            embedding = null;
        }
        timings["embed_ms"] = embedWatch.ElapsedMilliseconds;

        if (embedding is null || embedding.Length == 0)
        {
            timings["total_ms"] = total.ElapsedMilliseconds;
            return new SearchResponse(query, 0, [], "degraded_no_embedding", traceId, timings);
        }

        _log.LogInformation("search: embedding done dims={Dims} latency_ms={Latency}",
            embedding.Length, timings["embed_ms"]);

        // ── Step 2: pgvector cosine similarity search ───────────────────
        List<Ranking.RawProduct> rawProducts;
        string mode;

        var vectorWatch = Stopwatch.StartNew();
        try
        {
            rawProducts = await VectorSearchAsync(embedding, limit, ct);
            mode = "hybrid";
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "search: pgvector query failed, returning empty");
            rawProducts = [];
            mode = "degraded_db_error";
        }
        timings["pgvector_ms"] = vectorWatch.ElapsedMilliseconds;

        // ── Step 3: Hybrid Ranking ──────────────────────────────────────
        var rankWatch = Stopwatch.StartNew();
        var ranked = Ranking.Rank(query, rawProducts);
        timings["rank_ms"] = rankWatch.ElapsedMilliseconds;
        timings["total_ms"] = total.ElapsedMilliseconds;

        _log.LogInformation("search: complete results={Count} mode={Mode} total_ms={Total}",
            ranked.Count, mode, timings["total_ms"]);

        return new SearchResponse(query, ranked.Count, ranked, mode, traceId, timings);
    }

    // ─── ProdBERT Embedding ─────────────────────────────────────────────────────

    private sealed record EmbedRequest([property: JsonPropertyName("texts")] string[] Texts);
    private sealed record EmbedResponse([property: JsonPropertyName("embeddings")] double[][]? Embeddings);

    private async Task<double[]?> EmbedQueryAsync(string query, CancellationToken ct)
    {
        var url = (_config["PRODBERT_URL"] ?? "http://localhost:8001").TrimEnd('/') + "/embed";

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(new EmbedRequest([query])),
        };
        var internalToken = _config["INTERNAL_SERVICE_TOKEN"];
        if (!string.IsNullOrEmpty(internalToken))
            request.Headers.Add("X-Internal-Token", internalToken);

        using var response = await _http.SendAsync(request, ct);
        var payload = await response.Content.ReadFromJsonAsync<EmbedResponse>(ct);

        return payload?.Embeddings is { Length: > 0 } e ? e[0] : null;
    }

    // ─── pgvector Search ────────────────────────────────────────────────────────

    /// <summary>
    /// Cosine similarity search against public.product_embeddings, joined to
    /// public.products for the columns the ranker needs. The embedding column is
    /// vector(384) using the pgvector extension.
    /// </summary>
    private const string VectorSearchSql = """
        SELECT
            p.id,
            p.name,
            COALESCE(p.description, '') AS description,
            COALESCE(p.category, '')    AS category,
            COALESCE(p.current_price, 0) AS price,
            1 - (pe.embedding <=> $1::vector) AS vector_score,
            COALESCE(p.created_at, now())      AS created_at,
            COALESCE(pm.url, '')                AS image_url
        FROM public.product_embeddings pe
        JOIN public.products p ON p.id = pe.product_id
        LEFT JOIN LATERAL (
            SELECT url FROM public.product_media
            WHERE product_id = p.id AND media_type = 'photo'
            ORDER BY display_order ASC
            LIMIT 1
        ) pm ON true
        WHERE p.is_deleted IS NOT TRUE
        ORDER BY pe.embedding <=> $1::vector
        LIMIT $2
        """;

    private async Task<List<Ranking.RawProduct>> VectorSearchAsync(double[] embedding, int limit, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(VectorSearchSql, conn);
        cmd.Parameters.AddWithValue(FormatVector(embedding));
        cmd.Parameters.AddWithValue(limit);

        var products = new List<Ranking.RawProduct>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            products.Add(new Ranking.RawProduct
            {
                Id = reader.GetGuid(0).ToString(),
                Name = reader.GetString(1),
                Description = reader.GetString(2),
                Category = reader.GetString(3),
                Price = Convert.ToDouble(reader.GetValue(4)),
                VectorScore = Convert.ToDouble(reader.GetValue(5)),
                CreatedAt = reader.GetDateTime(6),
                ImageUrl = reader.GetString(7),
            });
        }

        return products;
    }

    /// <summary>Converts a double array to the pgvector wire literal '[x,y,z,...]'.</summary>
    private static string FormatVector(double[] v) =>
        v.Length == 0 ? "[]" : "[" + string.Join(",", v.Select(f => f.ToString("F8", System.Globalization.CultureInfo.InvariantCulture))) + "]";
}
