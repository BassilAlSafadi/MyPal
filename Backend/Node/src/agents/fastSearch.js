const { createLLMProvider } = require('../providers/llmProvider');

async function fastSearchFeature(query, internalProducts = [], provider = createLLMProvider()) {
  const searchResults = await provider.tavilySearch(query, 3);

  const mypalSection = internalProducts.length > 0
    ? `\n\nPRODUCTS AVAILABLE ON MYPAL (prefer these if they match the query):\n${JSON.stringify(internalProducts.slice(0, 5))}`
    : '';

  const prompt = `You are a fast search assistant for MyPal.
Based on these search results, provide a concise and direct answer to the user query.
If MyPal has matching products listed below, recommend them first as the best option.

Query: ${query}
External Results: ${JSON.stringify(searchResults)}${mypalSection}`;

  return provider.chat('gpt', [{ role: 'user', content: prompt }]);
}

module.exports = { fastSearchFeature };
