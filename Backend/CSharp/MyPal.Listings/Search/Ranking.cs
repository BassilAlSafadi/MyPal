namespace MyPal.Listings.Search;

/// <summary>
/// Hybrid ranking formula:
///
///     final_score = 0.60 × vector_cosine_score
///                 + 0.25 × bm25_keyword_score
///                 + 0.10 × seller_trust_score    (normalised to [0,1])
///                 + 0.05 × recency_boost          (normalised to [0,1])
///
/// Direct port of Backend/Go/internal/gateway/ranking. The catalogue moved into
/// this service, so the ranker moved with it; the weights, the scorers and the
/// explainability breakdown are unchanged.
/// </summary>
public static class Ranking
{
    /// <summary>Contribution of each signal to the final score. Must sum to 1.0.</summary>
    public const double VectorWeight = 0.60;
    public const double Bm25Weight = 0.25;
    public const double TrustWeight = 0.10;
    public const double RecencyWeight = 0.05;

    /// <summary>The data the ranker needs, populated from the pgvector query result.</summary>
    public sealed class RawProduct
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Category { get; set; } = "";
        public double Price { get; set; }
        public string ImageUrl { get; set; } = "";
        /// <summary>Cosine similarity from pgvector.</summary>
        public double VectorScore { get; set; }
        /// <summary>0–5 scale.</summary>
        public double SellerRating { get; set; }
        public int ReviewCount { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>Per-signal score breakdown for observability and UX.</summary>
    public sealed record Explanation(
        double vector_score,
        double bm25_score,
        double trust_score,
        double recency_score,
        string mode);

    /// <summary>The final normalised output per product. `title` mirrors the Go shape the SPA reads.</summary>
    public sealed record RankedResult(
        string id,
        string title,
        string? category,
        double price,
        string? image_url,
        double score,
        Explanation explanation);

    /// <summary>
    /// Applies the hybrid formula to a set of raw pgvector results and returns
    /// them ordered by descending final score.
    /// </summary>
    public static List<RankedResult> Rank(string query, IEnumerable<RawProduct> products)
    {
        var queryTokens = Tokenize(query);
        var results = new List<RankedResult>();

        foreach (var p in products)
        {
            var vectorScore = Clamp(p.VectorScore, 0, 1);
            var bm25 = Bm25Score(queryTokens, p.Name + " " + p.Description);
            var trust = NormaliseTrust(p.SellerRating, p.ReviewCount);
            var recency = RecencyBoost(p.CreatedAt);

            var final = VectorWeight * vectorScore
                + Bm25Weight * bm25
                + TrustWeight * trust
                + RecencyWeight * recency;

            results.Add(new RankedResult(
                p.Id, p.Name, p.Category, p.Price, p.ImageUrl, Round4(final),
                new Explanation(Round4(vectorScore), Round4(bm25), Round4(trust), Round4(recency), "hybrid")));
        }

        return results.OrderByDescending(r => r.score).ToList();
    }

    // ─── Scorers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// A simplified BM25-inspired term frequency score normalised to [0, 1]. A true
    /// BM25 IDF would need corpus statistics; this TF approximation is suitable for
    /// ranking of ≤50 docs.
    /// </summary>
    private static double Bm25Score(IReadOnlyList<string> queryTokens, string document)
    {
        var docTokens = Tokenize(document);
        if (docTokens.Count == 0 || queryTokens.Count == 0) return 0;

        var docFreq = new Dictionary<string, int>(docTokens.Count);
        foreach (var t in docTokens)
            docFreq[t] = docFreq.GetValueOrDefault(t) + 1;

        const double k1 = 1.5, b = 0.75;
        const double avgDocLen = 50.0; // approximate average product description length in tokens
        double docLen = docTokens.Count;

        double score = 0;
        foreach (var qt in queryTokens)
        {
            double tf = docFreq.GetValueOrDefault(qt);
            score += tf * (k1 + 1) / (tf + k1 * (1 - b + b * docLen / avgDocLen));
        }

        // Normalise: cap at the number of query tokens, then scale to [0,1].
        var maxScore = queryTokens.Count * (k1 + 1);
        return maxScore == 0 ? 0 : Clamp(score / maxScore, 0, 1);
    }

    /// <summary>
    /// Converts a seller rating (0–5) and review count into [0,1].
    /// Review count dampens the trust of sellers with very few reviews.
    /// </summary>
    private static double NormaliseTrust(double rating, int reviewCount)
    {
        if (rating <= 0) return 0;
        var basis = rating / 5.0;
        // Dampen trust for sellers with fewer than 10 reviews.
        var confidence = Math.Min(1.0, reviewCount / 10.0);
        return Clamp(basis * confidence, 0, 1);
    }

    /// <summary>
    /// Returns a score in [0,1] where products created within the last 30 days
    /// score near 1.0 and decay logarithmically over 365 days.
    /// </summary>
    private static double RecencyBoost(DateTime createdAt)
    {
        var ageHours = (DateTime.UtcNow - DateTime.SpecifyKind(createdAt, DateTimeKind.Utc)).TotalHours;
        if (ageHours <= 0) return 1.0;

        // Logarithmic decay: score = 1 - log(1 + age_days) / log(1 + 365)
        var ageDays = ageHours / 24;
        var score = 1.0 - Math.Log(1 + ageDays) / Math.Log(1 + 365);
        return Clamp(score, 0, 1);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private static List<string> Tokenize(string s)
    {
        var tokens = new List<string>();
        foreach (var word in s.ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
        {
            // Strip non-alphanumeric characters from word boundaries.
            var w = word.Trim('.', ',', '!', '?', ';', ':', '"', '\'', '(', ')', '-');
            if (w.Length > 1) tokens.Add(w);
        }
        return tokens;
    }

    private static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;

    private static double Round4(double v) => Math.Round(v * 10000) / 10000;
}
