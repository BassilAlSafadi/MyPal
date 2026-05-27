const { createLLMProvider } = require('../providers/llmProvider');

/**
 * MyPalSellerAnalytics implements the map-reduce seller evaluation pipeline from the notebook.
 *
 * Map phase:  Each product's reviews → structured sentiment profile (fast/cheap model).
 * Reduce phase: All profiles → unified Seller Identity Report (strategic model).
 */
class MyPalSellerAnalytics {
  constructor(provider = createLLMProvider()) {
    this.provider = provider;
  }

  /**
   * @param {Array<{product_name: string, reviews: string[]}>} productData
   * @returns {Promise<Array>} structured product profiles
   */
  async mapProductSummaries(productData) {
    const profiles = [];
    for (const item of productData) {
      const prompt = `Analyze reviews for "${item.product_name}".
Reviews: ${JSON.stringify(item.reviews)}

Return a JSON object with:
- 'sentiment_score': (1-10)
- 'key_praise': (top strength)
- 'key_complaint': (top weakness)
- 'grandma_score': (how easy/safe is this for non-tech seniors, 1-10)`;

      const response = await this.provider.chat('gpt', [{ role: 'user', content: prompt }], { responseFormat: 'json' });
      profiles.push({ ...response, product_name: item.product_name });
    }
    return profiles;
  }

  /**
   * @param {Array} profiles — output of mapProductSummaries
   * @returns {Promise<string>} Seller Identity Report narrative
   */
  async reduceToSellerIdentity(profiles) {
    const prompt = `ACT AS A SENIOR BUSINESS AUDITOR.
Analyze these product profiles for a single seller:
${JSON.stringify(profiles, null, 2)}

Task: Generate a 'Seller Identity Report' that reflects their attitude toward customers.
Focus on:
1. Operational Patterns (Are they consistent?)
2. Customer Centricity (Do they care about quality or just volume?)
3. Systematic Risks (Is there a recurring failure in their supply chain?)
4. The 'Grandma' Verdict (Is this seller reliable for non-tech users?)`;

    return this.provider.chat('cohere', [{ role: 'user', content: prompt }]);
  }

  /**
   * Full map-reduce pipeline — convenience wrapper.
   * @param {Array<{product_name: string, reviews: string[]}>} productData
   * @returns {Promise<{profiles: Array, report: string}>}
   */
  async analyze(productData) {
    const profiles = await this.mapProductSummaries(productData);
    const report = await this.reduceToSellerIdentity(profiles);
    return { profiles, report };
  }
}

module.exports = { MyPalSellerAnalytics };
