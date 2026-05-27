const { createLLMProvider } = require('../providers/llmProvider');

async function translateText(targetLanguage, text, provider = createLLMProvider()) {
  const prompt = `You are a professional translator.
Translate the following text into ${targetLanguage}.
Ensure the tone is natural and accurate.

Text: ${text}`;
  return provider.chat('gemini', [{ role: 'user', content: prompt }]);
}

module.exports = { translateText };
