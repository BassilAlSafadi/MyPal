const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { AgentExecutionTrace, AgenticValidationLog } = require('../../models');
const { createLLMProvider } = require('../providers/llmProvider');
const { runMyPalAgenticWorkflow } = require('../agents/agenticSearch');
const { fastSearchFeature } = require('../agents/fastSearch');
const { translateText } = require('../agents/translator');
const { summarizeContent } = require('../agents/summarizer');
const { askProductExpert } = require('../agents/productExpert');
const { cleanScrapedContent } = require('../agents/dataCleaner');
const { MyPalSellerAnalytics } = require('../agents/sellerAnalytics');
const { MyPalProdRecommender } = require('../agents/recommender');
const { safeParseJSON } = require('../utils/helpers');

const router = express.Router();

// Lazily initialized so env is loaded before first request
let pgPool = null;
function getPool() {
  if (!pgPool && process.env.POSTGRES_URL) {
    pgPool = new Pool({ connectionString: process.env.POSTGRES_URL });
    pgPool.on('error', (err) => console.error('Postgres pool error', err));
  }
  return pgPool;
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

router.post('/ai/deep-search', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await runMyPalAgenticWorkflow(req.body || {});
    return res.json({ result: result.state.final_output, state: result.state, reasoning_steps: result.trace, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

router.post('/ai/fast-search', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await fastSearchFeature(req.body.query || '');
    return res.json({ result, trace_id: traceId });
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
  const pool = getPool();
  if (pool) {
    try {
      const r = await pool.query(
        `SELECT id, seller_id, ai_generated_summary, top_complaint_themes::text, sentiment_score, grandma_score, created_at
         FROM public.seller_performance_summaries WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.sellerId],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
      const row = r.rows[0];
      let topThemes = [];
      try { topThemes = row.top_complaint_themes ? JSON.parse(row.top_complaint_themes) : []; } catch (_) {}
      return res.json({ id: row.id, sellerId: row.seller_id, aiGeneratedSummary: row.ai_generated_summary, topComplaintThemes: topThemes, sentimentScore: row.sentiment_score, grandmaScore: row.grandma_score, createdAt: row.created_at });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }
  res.json({
    id: `summary-${req.params.sellerId}`,
    sellerId: req.params.sellerId,
    aiGeneratedSummary: 'Seller shows inconsistent fulfillment times; overall trust tier: trusted. Grandma score: 7/10.',
    topComplaintThemes: ['Late shipping', 'Packaging quality'],
    sentimentScore: 0.72,
    createdAt: new Date().toISOString(),
  });
});

module.exports = router;
