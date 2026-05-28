const { createLLMProvider } = require('../providers/llmProvider');

async function askProductExpert({ question, product_data, persona }, provider = createLLMProvider()) {
  const metadataBlock = Object.entries(product_data || {})
    .map(([k, v]) => `- ${k.toUpperCase()}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n');

  const system = `ROLE:
You are the "MyPal Product Expert," a highly intelligent shopping assistant.
Your goal is to answer user questions about a SPECIFIC product using provided metadata.

USER PERSONA CONTEXT:
The user is currently identified with the following interests/persona: ${persona || 'General shopper'}
Tailor your tone, vocabulary, and priorities to match this persona.
(e.g., if Fitness, focus on health benefits/durability; if Tech, focus on specs/integration).

PRODUCT DATA (TRUTH SOURCE):
${metadataBlock}

CONSTRAINTS:
1. Answer ONLY based on the provided product data. If information is missing, state it clearly.
2. Be surgical and concise. No fluff.
3. If the product is 'External' (scraped), mention that the data is live from the web.
4. If the user asks something dangerous or irrelevant to the product, politely redirect them.

FORMATTING:
Use clean Markdown. Use bullet points for technical specs.`;

  return provider.chat('gemini', [
    { role: 'system', content: system },
    { role: 'user', content: question || '' },
  ]);
}

module.exports = { askProductExpert };
