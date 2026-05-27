const { createLLMProvider } = require('../providers/llmProvider');

/**
 * MyPalProdRecommender mirrors the notebook's ProdBERT + Gemini re-ranking pipeline.
 *
 * Step 1: Get embeddings from the Go embedding service (ProdBERT).
 * Step 2: Cosine similarity to find top-K candidates.
 * Step 3: LLM re-ranking for contextual precision.
 */
class MyPalProdRecommender {
  constructor(
    provider = createLLMProvider(),
    prodBertUrl = process.env.PRODBERT_URL || 'http://localhost:8001',
  ) {
    this.provider = provider;
    this.prodBertUrl = prodBertUrl.replace(/\/$/, '');
  }

  async getEmbeddings(texts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${this.prodBertUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data?.embeddings) ? data.embeddings : [];
    } catch (_) {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
    const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return normA && normB ? dot / (normA * normB) : 0;
  }

  /**
   * @param {string} userPersona — free-text user context / interests
   * @param {Array<{id: number|string, title: string, category: string}>} productCatalog
   * @returns {Promise<number[]>} top-3 product IDs in ranked order
   */
  async recommend(userPersona, productCatalog) {
    const catalogTexts = productCatalog.map((p) => `${p.title} ${p.category}`);
    const embeddings = await this.getEmbeddings([userPersona, ...catalogTexts]);

    let candidates = productCatalog;

    if (embeddings.length === productCatalog.length + 1) {
      const personaVec = embeddings[0];
      const catalogVecs = embeddings.slice(1);
      const scored = catalogVecs
        .map((vec, i) => ({ score: this.cosineSimilarity(personaVec, vec), index: i }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      candidates = scored.map(({ index }) => productCatalog[index]);
    }

    const candidateJson = candidates.map((c) => ({ id: c.id, name: c.title }));
    const prompt = `USER CONTEXT: ${userPersona}
PRODUCTS: ${JSON.stringify(candidateJson)}

Pick the top 3 products most relevant to the user context.
Return ONLY a JSON array of product IDs in order of relevance.
Example: [4, 12, 1]`;

    return this.provider.chat('gemini', [{ role: 'user', content: prompt }], { responseFormat: 'json' });
  }
}

module.exports = { MyPalProdRecommender };
