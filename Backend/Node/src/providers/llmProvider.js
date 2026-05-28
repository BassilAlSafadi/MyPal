const { safeParseJSON, asContent, normalizeMessages } = require('../utils/helpers');

const MODEL_CONFIG = {
  llama: {
    provider: 'github',
    model: 'meta/Llama-4-Maverick-17B-128E-Instruct-FP8',
    temperature: 0.2,
    max_tokens: 2048,
  },
  security: {
    provider: 'huggingface-classification',
    model: 'meta-llama/Prompt-Guard-86M',
  },
  audit: {
    provider: 'huggingface',
    model: 'openai/gpt-oss-20b',
    temperature: 0.1,
  },
  cohere: {
    provider: 'github',
    model: 'cohere/Cohere-command-r-plus-08-2024',
    temperature: 0.1,
  },
  phi: {
    provider: 'github',
    model: 'microsoft/Phi-4-multimodal-instruct',
    temperature: 0.1,
  },
  scout: {
    provider: 'github',
    model: 'meta/Llama-4-Scout-17B-16E-Instruct',
    temperature: 0.3,
  },
  mistral: {
    provider: 'mistral',
    model: 'mistral-large-latest',
    temperature: 0.1,
  },
  gpt: {
    provider: 'huggingface',
    model: 'openai/gpt-oss-20b',
    temperature: 0.1,
  },
  gemini: {
    provider: 'github',
    model: 'openai/gpt-4.1',
    temperature: 0.45,
  },
  summarizer: {
    provider: 'github',
    model: 'cohere/cohere-command-a',
    temperature: 0.3,
  },
};

function mockResponse(modelKey, messages, responseFormat) {
  const text = normalizeMessages(messages).map((m) => m.content).join('\n');
  if (responseFormat === 'json') {
    if (modelKey === 'llama') {
      const cleaned = text.slice(0, 300).replace(/\s+/g, ' ').trim();
      const vague = cleaned.length < 8;
      return {
        is_interrupt: vague,
        cleaned_intent: cleaned || 'unknown product search',
        missing_specs: vague ? 'Please provide product category, budget, location, and constraints.' : '',
      };
    }
    if (modelKey === 'audit') return { is_passed: true, critique: 'PASSED' };
    if (modelKey === 'gpt') {
      return {
        category: 'unknown',
        budget_min: null,
        budget_max: null,
        currency: null,
        features: [],
        brand_preference: null,
        location: null,
        extra_constraints: [],
      };
    }
    if (modelKey === 'phi') return { products: [], notes: [] };
  }
  if (modelKey === 'scout') return 'best product options price specs availability';
  if (modelKey === 'cohere') return 'No live LLM configured. Facts are unavailable beyond provided payload.';
  if (modelKey === 'gemini') return 'I need live model/search configuration to produce a verified MyPal answer.';
  return 'Mock orchestration output';
}

function createDefaultHttpClient() {
  return {
    async post(url, payload, options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: options.headers || { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const body = await response.text();
        const data = body ? safeParseJSON(body, body) : null;
        if (!response.ok) {
          const message = typeof data === 'string' ? data : JSON.stringify(data);
          const err = new Error(`HTTP ${response.status}: ${message}`);
          err.status = response.status;
          throw err;
        }
        return { data };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function createLLMProvider(env = process.env, httpClient = createDefaultHttpClient()) {
  const githubBase = env.GITHUB_BASE || 'https://models.github.ai/inference';
  const hfBase = env.HF_BASE || 'https://router.huggingface.co/v1';
  const mistralBase = env.MISTRAL_BASE || 'https://api.mistral.ai/v1';

  async function chat(modelKey, messages, options = {}) {
    const cfg = MODEL_CONFIG[modelKey];
    if (!cfg) throw new Error(`Unknown model key: ${modelKey}`);
    const normalized = normalizeMessages(messages);
    const responseFormat = options.responseFormat;
    const mock = () => mockResponse(modelKey, normalized, responseFormat);

    let apiKey = null;
    let baseUrl = null;
    if (cfg.provider === 'github') {
      apiKey = env.GITHUB_TOKEN;
      baseUrl = githubBase;
    } else if (cfg.provider === 'huggingface') {
      apiKey = env.HUGGING_FACE_API_KEY;
      baseUrl = hfBase;
    } else if (cfg.provider === 'mistral') {
      apiKey = env.MISTRAL_API_KEY;
      baseUrl = mistralBase;
    }

    if (!apiKey || !baseUrl) return mock();

    const payload = {
      model: cfg.model,
      messages: normalized,
      temperature: options.temperature ?? cfg.temperature,
      max_tokens: options.max_tokens ?? cfg.max_tokens ?? 1024,
    };
    if (responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    const res = await httpClient.post(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: options.timeoutMs || 30000,
      },
    );
    const content = asContent(res.data);
    return responseFormat === 'json' ? safeParseJSON(content, mock()) : content;
  }

  async function chatWithFallback(primary, messages, options = {}) {
    const attempts = options.attempts || 3;
    // Exponential backoff mirrors the notebook: wait_exponential(multiplier=1, min=2, max=10)
    const backoffMs = (i) => Math.min(10000, Math.max(2000, 1000 * Math.pow(2, i)));
    let lastErr = null;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await chat(primary, messages, options);
      } catch (err) {
        lastErr = err;
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, backoffMs(i)));
        }
      }
    }
    try {
      return await chat('mistral', messages, options);
    } catch (_) {
      if (options.responseFormat === 'json') return mockResponse(primary, messages, 'json');
      return mockResponse(primary, messages);
    }
  }

  async function classifySecurity(text) {
    const apiKey = env.HUGGING_FACE_API_KEY;
    if (!apiKey) {
      const suspicious = /(ignore previous|system prompt|jailbreak|database password|drop table|union select)/i.test(text);
      return [{ label: suspicious ? 'JAILBREAK' : 'SAFE', score: suspicious ? 0.95 : 0.99 }];
    }
    const res = await httpClient.post(
      `https://api-inference.huggingface.co/models/${MODEL_CONFIG.security.model}`,
      { inputs: text },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 },
    );
    return Array.isArray(res.data) ? res.data.flat() : [];
  }

  async function tavilySearch(query, maxResults = 3) {
    if (!env.TAVILY_API_KEY) {
      return [{ title: 'Mock search result', url: null, content: `No Tavily key configured for query: ${query}` }];
    }
    const res = await httpClient.post(
      'https://api.tavily.com/search',
      { api_key: env.TAVILY_API_KEY, query, max_results: maxResults, search_depth: 'advanced' },
      { timeout: 20000 },
    );
    return res.data?.results || [];
  }

  return { chat, chatWithFallback, classifySecurity, tavilySearch };
}

module.exports = { MODEL_CONFIG, createLLMProvider };
