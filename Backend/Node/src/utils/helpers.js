function stripReasoningAndFences(text = '') {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```/g, '')
    .trim();
}

function safeParseJSON(text, fallback = {}) {
  if (text && typeof text === 'object') return text;
  const cleaned = stripReasoningAndFences(text || '');
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return fallback;
    }
  }
}

function asContent(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (response.content) return response.content;
  if (response.choices?.[0]?.message) {
    const message = response.choices[0].message;
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => part?.text || part?.content || '')
        .filter(Boolean)
        .join('\n');
    }
    return '';
  }
  if (response.generations?.[0]?.text) return response.generations[0].text;
  if (response.text) return response.text;
  return JSON.stringify(response);
}

function normalizeMessages(messages) {
  return (messages || []).map((msg) => {
    if (typeof msg === 'string') return { role: 'user', content: msg };
    return { role: msg.role || 'user', content: msg.content || '' };
  });
}

module.exports = { stripReasoningAndFences, safeParseJSON, asContent, normalizeMessages };
