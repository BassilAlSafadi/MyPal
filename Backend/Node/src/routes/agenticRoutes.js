const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { AgentExecutionTrace, AgenticValidationLog } = require('../../models');
const { createLLMProvider } = require('../providers/llmProvider');
const { runMyPalAgenticWorkflow, runReliableDeepSearch } = require('../agents/agenticSearch');
const { fastSearchFeature } = require('../agents/fastSearch');
const { translateText } = require('../agents/translator');
const { summarizeContent } = require('../agents/summarizer');
const { askProductExpert } = require('../agents/productExpert');
const { cleanScrapedContent } = require('../agents/dataCleaner');
const { MyPalSellerAnalytics } = require('../agents/sellerAnalytics');
const { MyPalProdRecommender } = require('../agents/recommender');
const { safeParseJSON } = require('../utils/helpers');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Lazily initialized so env is loaded before first request.
// Supabase uses a self-signed cert chain — disable verification for the
// Node orchestrator's internal quota + analytics queries.
let pgPool = null;
function getPool() {
  if (!pgPool && process.env.POSTGRES_URL) {
    // Supabase uses a self-signed cert chain — strip ?sslmode=* and force
    // rejectUnauthorized:false so pg-pool doesn't throw on the certificate.
    const url = process.env.POSTGRES_URL.replace(/[?&]sslmode=[^&]*/g, '');
    pgPool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
    pgPool.on('error', (err) => console.error('Postgres pool error', err));
  }
  return pgPool;
}

// ── Personalization helpers ───────────────────────────────────────────────────

/**
 * Log a search query for a user. Non-blocking, non-fatal.
 * Keeps only the 50 most recent queries per user (rolling window).
 */
async function logSearch(userId, query) {
  const pool = getPool();
  if (!pool || !userId || !query?.trim()) return;
  try {
    await pool.query(
      `INSERT INTO public.user_searches (id, user_id, query, created_at)
       VALUES (extensions.uuid_generate_v4(), $1, $2, NOW())`,
      [userId, query.trim().substring(0, 500)],
    );
    // Trim to last 50 per user
    await pool.query(
      `DELETE FROM public.user_searches
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM public.user_searches
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 50
         )`,
      [userId],
    );
  } catch (_) { /* non-fatal — personalization is best-effort */ }
}

/**
 * Build a natural-language persona from the user's real activity:
 *   - last 15 search queries
 *   - categories/names from their wishlist
 *   - recent order item names + categories
 *
 * Returns null when the user has no recorded activity (new account),
 * so callers can fall back to a default persona.
 */
async function buildUserPersona(userId) {
  const pool = getPool();
  if (!pool || !userId) return null;
  try {
    const [searches, wishlist, orders] = await Promise.all([
      pool.query(
        `SELECT query FROM public.user_searches
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15`,
        [userId],
      ),
      pool.query(
        `SELECT DISTINCT p.name, p.category
         FROM public.wishlist_items w
         JOIN public.products p ON p.id = w.product_id
         WHERE w.user_id = $1 AND p.is_deleted IS NOT TRUE
         LIMIT 10`,
        [userId],
      ),
      pool.query(
        `SELECT p.name, p.category
         FROM public.order_items oi
         JOIN public.orders o ON o.id = oi.order_id
         JOIN public.products p ON p.id = oi.product_id
         WHERE o.user_id = $1 AND p.is_deleted IS NOT TRUE
         ORDER BY o.created_at DESC LIMIT 10`,
        [userId],
      ),
    ]);

    const parts = [];
    if (searches.rows.length) {
      parts.push(`Recently searched for: ${searches.rows.map((r) => r.query).join(', ')}`);
    }
    if (wishlist.rows.length) {
      const names = wishlist.rows.map((r) => r.name).slice(0, 6).join(', ');
      const cats  = [...new Set(wishlist.rows.map((r) => r.category).filter(Boolean))].join(', ');
      parts.push(`Saved to wishlist: ${names}${cats ? ` (${cats})` : ''}`);
    }
    if (orders.rows.length) {
      parts.push(`Previously purchased: ${orders.rows.map((r) => `${r.name}${r.category ? ` (${r.category})` : ''}`).join(', ')}`);
    }

    return parts.length > 0 ? parts.join('. ') : null;
  } catch (_) {
    return null;
  }
}

/**
 * Fetch the active product catalog directly from Postgres.
 * Returns id, title, category, price, and primary image URL.
 */
async function fetchCatalog(limit = 60) {
  const pool = getPool();
  if (!pool) return [];
  try {
    const r = await pool.query(
      `SELECT p.id::text,
              p.name          AS title,
              p.category,
              p.current_price AS price,
              (SELECT pm.url
               FROM public.product_media pm
               WHERE pm.product_id = p.id
               ORDER BY pm.display_order, pm.created_at
               LIMIT 1)       AS image
       FROM public.products p
       WHERE p.is_deleted IS NOT TRUE
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return r.rows.map((p) => ({
      id:       p.id,
      title:    p.title || '',
      category: p.category || '',
      price:    Number(p.price || 0),
      image:    p.image || null,
    }));
  } catch (_) {
    return [];
  }
}

// ── Health / root ─────────────────────────────────────────────────────────────

router.get('/', (_req, res) =>
  res.json({
    service: 'MyPal LLM Orchestrator',
    version: '2.0.0',
    status: 'ok',
    endpoints: [
      'POST /ai/deep-search',
      'POST /ai/fast-search',
      'POST /ai/translate',
      'POST /ai/summarize',
      'POST /ai/product/ask',
      'POST /ai/scraped/clean',
      'POST /ai/recommend',
      'POST /ai/seller/analyze',
      'POST /agent/orchestrate',
      'POST /summaries/map',
      'POST /summaries/reduce',
      'POST /seller/listing/analyze',
      'POST /seller/report/generate',
      'GET  /seller-report/:sellerId',
      'GET  /health',
    ],
  }),
);

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Agentic orchestration ─────────────────────────────────────────────────────

router.post('/agent/orchestrate', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const startTime = Date.now();
  let status = 'success';
  let out = null;
  let reasoningSteps = [];

  try {
    const input = {
      query: req.body.query || req.body.message || req.body.workflow,
      workflow: req.body.workflow,
      payload: req.body.payload,
      user_location: req.body.user_location || req.body.location,
      user_persona_bio: req.body.user_persona_bio || req.body.persona,
    };
    const result = await runMyPalAgenticWorkflow(input);
    out = result.state.final_output;
    reasoningSteps = result.trace;
  } catch (err) {
    status = 'error';
    out = String(err);
    reasoningSteps = [{ step: 'agentic_workflow_error', result: out }];
  }

  try {
    await AgentExecutionTrace.create({
      trace_id: traceId,
      workflow: req.body.workflow || 'unknown',
      provider: 'notebook-graph',
      model: 'notebook-langgraph-port',
      latency_ms: Date.now() - startTime,
      status,
      reasoning_steps: reasoningSteps,
    });
  } catch (e) {
    console.error('Failed to save AgentExecutionTrace', e);
  }

  if (status === 'error') return res.status(500).json({ error: out, trace_id: traceId });
  return res.json({ result: out, trace_id: traceId, reasoning_steps: reasoningSteps });
});

// ── AI features ───────────────────────────────────────────────────────────────

// ── Deep-search quota helpers ─────────────────────────────────────────────────
const DEEP_SEARCH_LIMIT = 3;

async function checkAndConsumeQuota(userId) {
  const pool = getPool();
  if (!pool || !userId) return { allowed: true, used: 0, remaining: DEEP_SEARCH_LIMIT };

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const r = await pool.query(
    'SELECT deep_search_date, deep_search_count FROM public.users WHERE id = $1',
    [userId],
  );
  if (!r.rows.length) return { allowed: true, used: 0, remaining: DEEP_SEARCH_LIMIT };

  const { deep_search_date: lastDate, deep_search_count: rawCount } = r.rows[0];
  const isToday = lastDate && lastDate.toISOString().split('T')[0] === today;
  const used = isToday ? (rawCount || 0) : 0;

  if (used >= DEEP_SEARCH_LIMIT) {
    return { allowed: false, used, remaining: 0 };
  }

  await pool.query(
    `UPDATE public.users SET deep_search_count = $1, deep_search_date = $2 WHERE id = $3`,
    [used + 1, today, userId],
  );
  return { allowed: true, used: used + 1, remaining: DEEP_SEARCH_LIMIT - (used + 1) };
}

router.get('/ai/deep-search/quota', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const pool = getPool();

  if (!pool || !userId) {
    return res.json({ used: 0, limit: DEEP_SEARCH_LIMIT, remaining: DEEP_SEARCH_LIMIT });
  }

  const today = new Date().toISOString().split('T')[0];
  const r = await pool.query(
    'SELECT deep_search_date, deep_search_count FROM public.users WHERE id = $1',
    [userId],
  );

  let used = 0;
  if (r.rows.length) {
    const { deep_search_date: lastDate, deep_search_count: cnt } = r.rows[0];
    const isToday = lastDate && lastDate.toISOString().split('T')[0] === today;
    used = isToday ? (cnt || 0) : 0;
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);

  return res.json({
    used,
    limit: DEEP_SEARCH_LIMIT,
    remaining: Math.max(0, DEEP_SEARCH_LIMIT - used),
    resets_at: tomorrow.toISOString(),
  });
});

router.post('/ai/deep-search', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const userId = req.headers['x-user-id'];

  // Enforce per-user 3 deep-searches/day limit to conserve LLM tokens.
  // Errors in the quota check are non-fatal — always allow the request through.
  try {
    const quota = await checkAndConsumeQuota(userId);
    if (!quota.allowed) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0);
      return res.status(429).json({
        error: 'quota_exceeded',
        message: `Daily Pro search limit reached (${DEEP_SEARCH_LIMIT}/day). Resets at midnight.`,
        resets_at: tomorrow.toISOString(),
        trace_id: traceId,
      });
    }
  } catch (quotaErr) {
    console.warn('[quota] check failed (non-fatal):', quotaErr && quotaErr.message);
  }

  // Log search for recommendation personalization (fire-and-forget)
  if (req.body.query) logSearch(userId, req.body.query);

  try {
    const result = req.body?.full_workflow
      ? await runMyPalAgenticWorkflow(req.body || {})
      : await runReliableDeepSearch(req.body || {});
    return res.json({ result: result.state.final_output, state: result.state, reasoning_steps: result.trace, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

router.post('/ai/fast-search', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const userId  = req.headers['x-user-id'];

  // Log search for recommendation personalization (fire-and-forget)
  if (req.body.query) logSearch(userId, req.body.query);

  try {
    const { text, products } = await fastSearchFeature(req.body.query || '', req.body.internal_products || []);
    return res.json({ result: text, products: products || [], trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

router.post('/ai/translate', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await translateText(req.body.target_language, req.body.text);
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

router.post('/ai/summarize', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await summarizeContent(req.body.text || '', req.body.length || 'medium');
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

router.post('/ai/product/ask', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await askProductExpert({
      question: req.body.question,
      product_data: req.body.product_data,
      persona: req.body.persona,
    });
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

router.post('/ai/scraped/clean', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await cleanScrapedContent(req.body.raw_text || '');
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

router.post('/ai/recommend', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const recommender = new MyPalProdRecommender();
    const result = await recommender.recommend(req.body.persona || '', req.body.catalog || []);
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

/**
 * GET /ai/recommend/me
 *
 * Personalized recommendations built from the authenticated user's real activity:
 *   - search history  → what they look for
 *   - wishlist        → what they intend to buy
 *   - order history   → what they've already bought
 *
 * New users (no activity yet) get a default "general shopper" persona so the
 * home screen always shows something useful instead of nothing.
 *
 * Response: { products: [{id, title, category, price, image}], persona: "personalized"|"default" }
 */
router.get('/ai/recommend/me', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const userId  = req.headers['x-user-id'];

  try {
    // 1. Fetch the active catalog from DB
    const catalog = await fetchCatalog(60);
    if (!catalog.length) {
      return res.json({ products: [], persona: 'default', trace_id: traceId });
    }

    // 2. Build persona from the user's real activity (searches + wishlist + orders)
    const activityPersona = userId ? await buildUserPersona(userId) : null;
    const isPersonalized  = Boolean(activityPersona);
    const persona = activityPersona
      || 'General shopper looking for quality products at good value across all categories';

    // 3. Run ProdBERT embedding + LLM re-ranking
    const recommender = new MyPalProdRecommender();
    const raw = await recommender.recommend(persona, catalog);

    // 4. Parse the IDs the LLM returned and map back to full product records
    let topIds = [];
    try {
      const str   = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const match = str.match(/\[[\s\S]*?\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) topIds = parsed.map(String);
      }
    } catch (_) { /* ignore parse errors — fall through to slice */ }

    const products = topIds.length > 0
      ? topIds.map((id) => catalog.find((p) => p.id === id)).filter(Boolean).slice(0, 3)
      : catalog.slice(0, 3);  // graceful fallback: newest 3 products

    return res.json({ products, persona: isPersonalized ? 'personalized' : 'default', trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

// ── Seller analytics — full pipeline (map → reduce) ──────────────────────────
// Called by Go /api/v1/ai/agentic/seller-analyze for the notebook-equivalent full pipeline.

router.post('/ai/seller/analyze', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    if (!Array.isArray(req.body.products)) {
      return res.status(400).json({ error: 'products array required', trace_id: traceId });
    }
    const analytics = new MyPalSellerAnalytics();
    const result = await analytics.analyze(req.body.products);
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

// ── Seller analytics (map-reduce) ─────────────────────────────────────────────

router.post('/summaries/map', async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products)) return res.status(400).json({ error: 'products array required' });
    const analytics = new MyPalSellerAnalytics();
    const profiles = await analytics.mapProductSummaries(products);
    return res.json({ summaries: profiles });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post('/summaries/reduce', async (req, res) => {
  try {
    const { profiles, sellerId } = req.body;
    if (!Array.isArray(profiles)) return res.status(400).json({ error: 'profiles array required' });
    const analytics = new MyPalSellerAnalytics();
    const out = await analytics.reduceToSellerIdentity(profiles);
    const parsed = safeParseJSON(out, null);

    const pool = getPool();
    let stored = null;
    try {
      if (pool && sellerId) {
        const vals = [
          sellerId,
          parsed?.aiGeneratedSummary || out,
          parsed?.topComplaintThemes ? JSON.stringify(parsed.topComplaintThemes) : null,
          parsed?.sentimentScore || null,
          parsed?.grandmaScore || null,
          null,
          null,
        ];
        const r = await pool.query(
          `INSERT INTO public.seller_performance_summaries
           (seller_id, ai_generated_summary, top_complaint_themes, sentiment_score, grandma_score, summary_period_start, summary_period_end)
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) RETURNING id, created_at`,
          vals,
        );
        stored = r.rows[0];
      }
    } catch (err) {
      console.error('Failed to persist summary', err);
    }

    return res.json({ seller_report: out, parsed, stored });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ── Seller workflows ──────────────────────────────────────────────────────────

router.post('/seller/listing/analyze', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const { title, description, category, price } = req.body;
  let status = 'success';
  let out = null;

  try {
    const provider = createLLMProvider();
    const prompt = `Analyze this product listing for completeness, policy violations, and SEO:
Title: ${title}
Desc: ${description}
Category: ${category}
Price: ${price}
Return a JSON with "is_valid" (boolean), "confidence_score" (0-1), "suggestions" (array), "flags" (array).`;

    const raw = await provider.chat('gemini', [{ role: 'user', content: prompt }], { responseFormat: 'json' });
    out = raw || { is_valid: true, confidence_score: 0.5, suggestions: [], flags: [] };
  } catch (err) {
    status = 'error';
    out = { is_valid: false, confidence_score: 0, suggestions: [], flags: ['Analysis failed'] };
  }

  try {
    await AgenticValidationLog.create({
      trace_id: traceId,
      entity_id: req.body.listing_id || 'new',
      entity_type: 'listing',
      validation_result: out.is_valid,
      notes: JSON.stringify(out),
    });
  } catch (e) {
    console.error('Failed to save AgenticValidationLog', e);
  }

  res.json({ ...out, trace_id: traceId });
});

router.post('/seller/report/generate', (_req, res) => {
  const traceId = _req.headers['x-trace-id'] || crypto.randomUUID();
  res.json({ report_url: 'https://mypal.app/reports/demo.pdf', summary: 'Report generated successfully.', trace_id: traceId });
});

router.get('/seller-report/:sellerId', async (req, res) => {
  const sellerId = req.params.sellerId;
  const pool = getPool();
  if (pool) {
    if (!UUID_RE.test(sellerId)) return res.status(404).json({ error: 'not found' });

    try {
      let r;
      try {
        r = await pool.query(
          `SELECT id, seller_id, ai_generated_summary, top_complaint_themes::text, sentiment_score, grandma_score, created_at
           FROM public.seller_performance_summaries WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [sellerId],
        );
      } catch (e) {
        if (e?.code !== '42703') throw e;
        r = await pool.query(
          `SELECT id, seller_id, ai_generated_summary, top_complaint_themes::text, sentiment_score, NULL::integer AS grandma_score, created_at
           FROM public.seller_performance_summaries WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [sellerId],
        );
      }
      if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
      const row = r.rows[0];
      let topThemes = [];
      try { topThemes = row.top_complaint_themes ? JSON.parse(row.top_complaint_themes) : []; } catch (_) {}
      return res.json({ id: row.id, sellerId: row.seller_id, aiGeneratedSummary: row.ai_generated_summary, topComplaintThemes: topThemes, sentimentScore: row.sentiment_score, grandmaScore: row.grandma_score, createdAt: row.created_at });
    } catch (e) {
      console.error('seller-report lookup failed', e);
      return res.status(503).json({ error: 'seller report unavailable' });
    }
  }
  res.json({
    id: `summary-${sellerId}`,
    sellerId,
    aiGeneratedSummary: 'Seller shows inconsistent fulfillment times; overall trust tier: trusted. Grandma score: 7/10.',
    topComplaintThemes: ['Late shipping', 'Packaging quality'],
    sentimentScore: 0.72,
    createdAt: new Date().toISOString(),
  });
});

module.exports = router;
