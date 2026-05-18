# Semantic Search Architecture

## Pipeline

```
Frontend Query
  → Go Gateway (correlation ID, JWT validation)
    → SSQL Sanitization Middleware (AST-based, not regex)
      → Python ProdBERT /embed (query → 384-dim vector)
        → PostgreSQL pgvector (cosine similarity, HNSW index)
          → Hybrid Ranking Engine (vector score + keyword BM25 + business signals)
            → Explainability Metadata Assembly
              → Response to Frontend
```

## Embedding Lifecycle

1. **Product Indexing** (write-time): When a product is created/updated in C#, an event triggers ProdBERT to generate embeddings. Stored in `public.product_embeddings(id, product_id, embedding vector(384), created_at)`.
2. **Query Embedding** (read-time): User query hits ProdBERT `/embed` endpoint. Returns 384-dim vector. Cached in Redis for 5 minutes keyed by query hash.
3. **Vector Search**: Gateway executes `SELECT ... ORDER BY embedding <=> $1 LIMIT 20` against pgvector HNSW index.

## Hybrid Ranking Strategy

```
final_score = (0.6 × vector_cosine_score)
            + (0.25 × bm25_keyword_score)
            + (0.10 × seller_grandma_score / 10)
            + (0.05 × recency_boost)
```

- **Vector score**: Cosine similarity from pgvector
- **BM25 score**: PostgreSQL `ts_rank` full-text search on title + description
- **Business signals**: Grandma score, seller rating, review count
- **Recency**: Logarithmic decay over product age

## Latency Budget (2000ms total)

| Stage | Budget |
|:---|:---|
| Gateway middleware | 50ms |
| SSQL validation | 20ms |
| ProdBERT embedding | 200ms |
| pgvector search | 300ms |
| BM25 keyword search | 100ms |
| Hybrid ranking + assembly | 100ms |
| Network overhead | 230ms |
| **Buffer** | **1000ms** |

## Semantic Caching

- **Layer 1**: Redis caches `hash(query) → embedding` for 5 min
- **Layer 2**: Redis caches `hash(query) → final_results` for 60 seconds (stale-while-revalidate)
- **Invalidation**: Product update events flush affected result caches

## Explainability Metadata

Every search result includes:

```json
{
  "product_id": "...",
  "scores": {
    "vector_similarity": 0.87,
    "keyword_relevance": 0.65,
    "seller_trust": 0.70,
    "final_score": 0.79
  },
  "explanation": "High semantic match for 'wireless earbuds'. Seller has 4.8★ rating."
}
```

## SSQL Validation Redesign

Replace regex-based validation with AST-based parsing:

1. Tokenize the input query string
2. Build an abstract syntax tree of search operators
3. Validate against an allowlist of safe operators
4. Reject any token that cannot be parsed into the AST
5. Return sanitized query string for downstream use

This eliminates regex bypass attacks entirely.
