const { createLLMProvider } = require('../providers/llmProvider');

/**
 * Fast Search — mirrors the notebook's fast_search_feature (Cell 23).
 *
 * Acts like a general-purpose search engine (not shopping-only):
 *   1. Tavily web search   → real-time results from the open web
 *   2. DDG/Tavily links   → real source URLs passed to the UI
 *   3. GPT-OSS-20b (HF)   → natural-language answer with cited sources
 *
 * If the user's query happens to be shopping-related the MyPal catalog
 * results are injected as context so the model can recommend in-app products.
 */
async function fastSearchFeature(query, internalProducts = [], provider = createLLMProvider()) {
  const [searchResults, webLinks] = await Promise.all([
    provider.tavilySearch(query, 5),
    provider.duckDuckGoSearch ? provider.duckDuckGoSearch(query, 6) : Promise.resolve([]),
  ]);

  const mypalSection = internalProducts.length > 0
    ? `\n\nPRODUCTS AVAILABLE ON MYPAL (if the query is shopping-related, recommend these first):\n${JSON.stringify(internalProducts.slice(0, 5))}`
    : '';

  const sourceSummary = searchResults
    .map((r, i) => `[${i + 1}] ${r.title || ''}\nURL: ${r.url || ''}\n${r.content || ''}`)
    .join('\n\n');

  const prompt = `You are a helpful search assistant — like a web search engine.
Answer the user's query accurately, helpfully, and concisely based on the web results below.

Rules:
- If it is a factual question, answer it directly and cite your sources with markdown links.
- If it is a shopping / product query, list the best options with prices and links.
- If it is a news query, summarise the key facts and link to sources.
- If it is a how-to or technical query, give clear step-by-step guidance.
- Always include at least 2–3 source links using [Title](URL) format.
- Do NOT make up facts not present in the results.

Query: ${query}

Web Results:
${sourceSummary}${mypalSection}`;

  const text = await provider.chat('gpt', [{ role: 'user', content: prompt }]);
  return { text: realText(text), products: webLinks };
}

// Strip the Node mock sentinel so the UI shows empty instead of placeholder text.
const MOCK_MARKERS = ['mock orchestration output', 'mock orchestration'];
function realText(value) {
  const t = typeof value === 'string' ? value.trim() : '';
  if (!t) return '';
  return MOCK_MARKERS.some((m) => t.toLowerCase().includes(m)) ? '' : t;
}

module.exports = { fastSearchFeature };
