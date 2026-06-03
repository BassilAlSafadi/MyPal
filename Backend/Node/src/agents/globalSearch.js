const { createLLMProvider } = require('../providers/llmProvider');

/**
 * Global Agentic Search — powered by Gemini 2.5 Flash.
 *
 * Intentionally simpler than the Pro deep-search workflow:
 *   1. Tavily web search  → real-time results
 *   2. Tavily shopping links → product URLs
 *   3. Gemini 2.5 Flash  → synthesised answer + cited sources
 *
 * No quota gate, no 14-node pipeline. Returns in ~5-10 s.
 */
async function runGlobalSearch(query, internalProducts = [], provider = createLLMProvider()) {
  if (!query || !query.trim()) {
    return { text: 'Please enter a search query.', products: [] };
  }

  const [searchResults, webLinks] = await Promise.all([
    provider.tavilySearch(query.trim(), 6),
    provider.duckDuckGoSearch ? provider.duckDuckGoSearch(query.trim(), 6) : Promise.resolve([]),
  ]);

  const sourceSummary = (Array.isArray(searchResults) ? searchResults : [])
    .filter((r) => r && (r.title || r.content))
    .map((r, i) => `[${i + 1}] ${r.title || 'Result'}\nURL: ${r.url || ''}\n${r.content || ''}`)
    .join('\n\n');

  const mypalSection = internalProducts.length > 0
    ? `\n\nProducts available to buy directly on MyPal (recommend these first if relevant):\n${JSON.stringify(internalProducts.slice(0, 5))}`
    : '';

  const isSearchUnavailable = !sourceSummary || /search unavailable/i.test(sourceSummary);

  if (isSearchUnavailable) {
    const fallback = webLinks.length > 0
      ? `Here are some results for "${query}":\n\n` +
        webLinks.slice(0, 5).map((p, i) => `${i + 1}. [${p.name || 'Result'}](${p.source_url})`).join('\n')
      : `No live search results found for "${query}". Please try again.`;
    return { text: fallback, products: webLinks };
  }

  const prompt = `You are a helpful search assistant. Answer the user's query clearly based on the live web results below.

Rules:
- Factual/how-to questions: answer directly, cite sources as [Title](URL).
- Shopping/product queries: list the best options with prices and buy links.
- News queries: summarise key facts and link to sources.
- Always include at least 2 source links in [Title](URL) format.
- Never fabricate URLs — only use URLs from the results.
- Be concise and structured (use markdown headings or bullet points where helpful).

Query: ${query}

Web Results:
${sourceSummary}${mypalSection}`;

  const text = await provider.chat('gemini-flash', [{ role: 'user', content: prompt }]);
  const finalText = typeof text === 'string' && text.trim() ? text.trim() : buildFallback(query, webLinks);

  return { text: finalText, products: webLinks };
}

function buildFallback(query, webLinks) {
  if (webLinks.length === 0) return `No results found for "${query}".`;
  return [
    `Here are results for "${query}":`,
    '',
    ...webLinks.slice(0, 5).map((p, i) => `${i + 1}. [${p.name || 'Result'}](${p.source_url})`),
  ].join('\n');
}

module.exports = { runGlobalSearch };
