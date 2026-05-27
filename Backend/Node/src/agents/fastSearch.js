const { createLLMProvider } = require('../providers/llmProvider');

async function fastSearchFeature(query, provider = createLLMProvider()) {
  const searchResults = await provider.tavilySearch(query, 3);
  const prompt = `You are a fast search assistant.
Based on these search results, provide a concise and direct answer to the user query.

Query: ${query}
Results: ${JSON.stringify(searchResults)}`;
  return provider.chat('gemini', [{ role: 'user', content: prompt }]);
}

module.exports = { fastSearchFeature };
