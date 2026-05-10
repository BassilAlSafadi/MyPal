package security

import (
    "net/http"
    "regexp"
    "strings"
)

var injectionPattern = regexp.MustCompile(`(?i)(--|;|\bDROP\b|\bDELETE\b|\bUPDATE\b|\bALTER\b|\bGRANT\b|\bREVOKE\b|\bUNION\s+SELECT\b|\bINSERT\s+INTO\b|\bTRUNCATE\b)`)

// IsQuerySafe performs a fast pattern-based check for obvious SQL injection attempts.
// Returns true when the query appears safe for further processing.
func IsQuerySafe(q string) bool {
    if q == "" {
        return true
    }
    if injectionPattern.MatchString(q) {
        return false
    }

    // Additional heuristics: overly long queries or suspicious tokens
    if len(q) > 2000 { // unexpectedly long
        return false
    }
    lowered := strings.ToLower(q)
    if strings.Contains(lowered, "password") || strings.Contains(lowered, "secret") {
        return false
    }

    return true
}

// HTTP handler for quick validation endpoint
func ValidateHandler(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query().Get("q")
    safe := IsQuerySafe(q)
    if safe {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("SAFE"))
        return
    }
    w.WriteHeader(http.StatusForbidden)
    w.Write([]byte("DANGEROUS"))
}
