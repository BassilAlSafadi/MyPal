using System.Text.RegularExpressions;

namespace MyPal.Listings.Search;

/// <summary>
/// Port of Backend/Go/internal/security.IsQuerySafe. The gateway ran this as
/// SSQLValidation middleware in front of the search route; the search route now
/// lives here, so the check runs here.
/// </summary>
public static partial class SsqlSanitizer
{
    [GeneratedRegex(
        @"(--|;|\bDROP\b|\bDELETE\b|\bUPDATE\b|\bALTER\b|\bGRANT\b|\bREVOKE\b|\bUNION\s+SELECT\b|\bINSERT\s+INTO\b|\bTRUNCATE\b)",
        RegexOptions.IgnoreCase)]
    private static partial Regex InjectionPattern();

    /// <summary>
    /// Fast pattern-based check for obvious SQL injection attempts.
    /// Returns true when the query appears safe for further processing.
    /// </summary>
    public static bool IsQuerySafe(string? q)
    {
        if (string.IsNullOrEmpty(q)) return true;
        if (InjectionPattern().IsMatch(q)) return false;

        // Additional heuristics: overly long queries or suspicious tokens
        if (q.Length > 2000) return false; // unexpectedly long

        var lowered = q.ToLowerInvariant();
        if (lowered.Contains("password") || lowered.Contains("secret")) return false;

        return true;
    }
}
