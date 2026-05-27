const { createLLMProvider } = require('../providers/llmProvider');

async function summarizeContent(text, length = 'medium', provider = createLLMProvider()) {
  return provider.chat('summarizer', [
    {
      role: 'system',
      content: `Summarize the following text in a ${length} paragraph. Identify technical debt and architectural bottlenecks.`,
    },
    { role: 'user', content: text },
  ], { temperature: 0.3 });
}

module.exports = { summarizeContent };
