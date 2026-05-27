const { createLLMProvider } = require('../providers/llmProvider');

async function cleanScrapedContent(rawText, provider = createLLMProvider()) {
  const prompt = `You are a Data Extraction Agent. I will give you raw text scraped from a product page.
Your task is to extract the following fields and return ONLY a valid JSON object:

Fields:
- title (Product Name)
- price (Numeric value only)
- currency (e.g., EGP, USD)
- specs (Main technical details)
- category (Best fit for the item)
- description (A 1-sentence summary for BERT)

RAW TEXT:
${String(rawText || '').slice(0, 4000)}

RETURN ONLY JSON:`;

  return provider.chat('gemini', [{ role: 'user', content: prompt }], { responseFormat: 'json', temperature: 0 });
}

module.exports = { cleanScrapedContent };
