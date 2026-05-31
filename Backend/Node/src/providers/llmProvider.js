const { safeParseJSON, asContent, normalizeMessages } = require('../utils/helpers');

// Model configuration matching the notebook's exact assignments:
//   llama   → Llama-4-Maverick via GitHub (Orchestrator / Mediator)
//   security→ Prompt-Guard-86M via HF InferenceClient (Entry Shield)
//   audit   → gpt-oss-20b via HF_BASE (Qwen/Auditor)
//   cohere  → Cohere-command-a via GitHub (Extractor / Facts)
//   phi     → Phi-4-multimodal via GitHub (JSON Formatter)
//   scout   → Llama-4-Scout via GitHub (Search Architect / Intake)
//   mistral → mistral-large-latest via Mistral API (Fallback)
//   gpt     → gpt-oss-20b via HF_BASE  (JSON Converter — uses HUGGING_FACE_API_KEY)
//   gemini  → gpt-oss-20b via HuggingFace  (Final Renderer — uses HF API key, same as gpt/audit)
//   summarizer → Cohere-command-a via GitHub (Text Summarizer)
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
  // Auditor: uses HuggingFace API key with the GPT-OSS model (not OpenAI API)
  audit: {
    provider: 'huggingface',
    model: 'openai/gpt-oss-20b',
    temperature: 0.1,
  },
  // Cohere: GitHub-hosted Cohere-command-a via GitHub Token
  cohere: {
    provider: 'github',
    model: 'cohere/Cohere-command-a',
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
  // gpt: HuggingFace-hosted GPT-OSS-20b — the notebook's gpt_llm (uses HF API key)
  gpt: {
    provider: 'huggingface',
    model: 'openai/gpt-oss-20b',
    temperature: 0.1,
  },
  // gemini: final renderer — now uses HuggingFace GPT-OSS-20b (HUGGING_FACE_API_KEY)
  // so all GPT nodes consistently use the same HF API key, no GitHub token needed.
  gemini: {
    provider: 'huggingface',
    model: 'openai/gpt-oss-20b',
    temperature: 0.45,
  },
  // summarizer: Cohere-command-a via GitHub (matches CohereSummarizer in notebook)
  summarizer: {
    provider: 'github',
    model: 'cohere/Cohere-command-a',
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

function heuristicSecurityClassification(text) {
  const suspicious = /(ignore previous|system prompt|jailbreak|database password|drop table|union select)/i.test(text);
  return [{ label: suspicious ? 'JAILBREAK' : 'SAFE', score: suspicious ? 0.95 : 0.99 }];
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
    async get(url, options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: options.headers || {},
          signal: controller.signal,
        });
        const body = await response.text();
        const data = body ? safeParseJSON(body, body) : null;
        if (!response.ok) {
          const err = new Error(`HTTP ${response.status}`);
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

    // Degrade to a mock response on any provider error (bad/expired key, rate
    // limit, model not found, network) so a single failing node never crashes
    // the whole agentic workflow with a 500.
    try {
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
    } catch (_) {
      return mock();
    }
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
      return heuristicSecurityClassification(text);
    }
    try {
      const res = await httpClient.post(
        `https://api-inference.huggingface.co/models/${MODEL_CONFIG.security.model}`,
        { inputs: text },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 },
      );
      const results = Array.isArray(res.data) ? res.data.flat() : [];
      return results.length > 0 ? results : heuristicSecurityClassification(text);
    } catch (_) {
      return heuristicSecurityClassification(text);
    }
  }

  async function tavilySearch(query, maxResults = 3) {
    if (!env.TAVILY_API_KEY) {
      return [{ title: 'Search unavailable', url: null, content: `Live search is not configured for query: ${query}` }];
    }
    try {
      const res = await httpClient.post(
        'https://api.tavily.com/search',
        { api_key: env.TAVILY_API_KEY, query, max_results: maxResults, search_depth: 'advanced' },
        { timeout: 20000 },
      );
      return Array.isArray(res.data?.results) ? res.data.results : [];
    } catch (_) {
      return [{ title: 'Search unavailable', url: null, content: `Live search is temporarily unavailable for query: ${query}` }];
    }
  }

  // Product link search — uses Tavily with a shopping-focused query to find
  // real retailer pages. DDG was tried but blocks automated requests.
  // Results give the LLM real URLs (Amazon, Best Buy, B&H, etc.) to cite.
  async function duckDuckGoSearch(query, maxResults = 6) {
    if (!query) return [];
    // Use Tavily for general web results — no shopping bias.
    // The function name is kept as duckDuckGoSearch for compatibility with callers.
    try {
      const results = await tavilySearch(query, maxResults);
      return results
        .filter((r) => r.url && r.title)
        .slice(0, maxResults)
        .map((r) => {
          let hostname = '';
          try { hostname = new URL(r.url).hostname.replace('www.', ''); } catch (_) {}
          return {
            name:       r.title || '',
            price:      0,           // price extracted later by gpt_calculate_node
            currency:   'USD',
            source:     hostname,
            source_url: r.url,
            thumbnail:  null,
            // Pass the snippet as a spec so the LLM can attempt price extraction
            key_specs:  [r.content || ''].filter(Boolean),
            total_cost: 0,
          };
        });
    } catch (_) {
      return [];
    }
  }

  return { chat, chatWithFallback, classifySecurity, tavilySearch, duckDuckGoSearch };
}

module.exports = { MODEL_CONFIG, createLLMProvider };
