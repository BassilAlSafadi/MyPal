/**
 * AI Provider Configuration Scaffolding
 */
const aiConfig = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    endpoint: process.env.GEMINI_ENDPOINT,
    model: 'gemini-2.5-pro',
  },
  cohere: {
    apiKey: process.env.COHERE_API_KEY,
    model: 'command',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-turbo',
  },
  fallbackEnabled: process.env.ENABLE_LLM_FALLBACK === 'true',
};

module.exports = aiConfig;
