require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

const PORT = process.env.NODE_ORCHESTRATOR_PORT || 5002;

const COHERE_API_KEY = process.env.COHERE_API_KEY || null;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT || null; 
const PRODBERT_URL = process.env.PRODBERT_URL || `http://localhost:8001`;
const POSTGRES_URL = process.env.POSTGRES_URL || null;

const { Pool } = require('pg');
let pgPool = null;
if (POSTGRES_URL) {
  pgPool = new Pool({ connectionString: POSTGRES_URL });
  pgPool.on('error', (err) => console.error('Postgres pool error', err));
}

const mongoose = require('mongoose');
const { AgentExecutionTrace, AgenticValidationLog } = require('./models');
const {
  runMyPalAgenticWorkflow,
  fastSearchFeature,
  translateText,
  summarizeContent,
  askProductExpert,
  cleanScrapedContent,
} = require('./agenticWorkflow');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mypal_audit';
mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB audit store'))
  .catch(err => console.error('MongoDB connection error:', err));

async function callCohere(prompt, options = {}){
  if(!COHERE_API_KEY) throw new Error('COHERE_API_KEY not set');
  const url = 'https://api.cohere.ai/generate';
  const payload = {
    model: options.model || 'command',
    prompt: prompt,
    max_tokens: options.max_tokens || 256,
    temperature: options.temperature || 0.2
  };
  const res = await axios.post(url, payload, { headers: { 'Authorization': `Bearer ${COHERE_API_KEY}`, 'Content-Type': 'application/json' } });
  return res.data;
}

async function callGemini(prompt, options = {}){
  if(!GEMINI_ENDPOINT || !GEMINI_API_KEY) throw new Error('GEMINI_ENDPOINT or GEMINI_API_KEY not set');
  const url = GEMINI_ENDPOINT; // Expect user to set a correct endpoint
  const res = await axios.post(url, { prompt, ...options }, { headers: { 'Authorization': `Bearer ${GEMINI_API_KEY}`, 'Content-Type': 'application/json' } });
  return res.data;
}

async function callProdBertEmbed(texts = []){
  const url = `${PRODBERT_URL.replace(/\/$/, '')}/embed`;
  const r = await axios.post(url, { texts });
  return r.data?.embeddings || null;
}

function safeParseJSON(s){
  if(!s) return null;
  try { return JSON.parse(s); } catch(e) {
    const m = s.match(/\{[\s\S]*\}/);
    if(m) {
      try { return JSON.parse(m[0]); } catch(e2) { return null; }
    }
    return null;
  }
}

// Map: summarize reviews per product
app.post('/summaries/map', async (req, res) => {
  try{
    const { products } = req.body;
    if(!Array.isArray(products)) return res.status(400).json({ error: 'products array required' });

    const summaries = [];
    for(const item of products){
      const prompt = `Analyze reviews for "${item.product_name}".\nReviews: ${JSON.stringify(item.reviews)}\nReturn a JSON object with 'sentiment_score' (1-10), 'key_praise', 'key_complaint', 'grandma_score'.`;
      let out = null;
      try{
        if(COHERE_API_KEY){
          const r = await callCohere(prompt, { max_tokens: 200 });
          out = r?.generations?.[0]?.text || JSON.stringify({ error: 'no response' });
        } else if(GEMINI_ENDPOINT){
          const r = await callGemini(prompt);
          out = r?.content || JSON.stringify({ error: 'no response' });
        } else {
          out = JSON.stringify({ note: 'NO_LLM_CONFIGURED', product: item.product_name });
        }
      }catch(e){
        out = JSON.stringify({ error: String(e) });
      }
      // Optionally enrich with ProdBERT-ranked review examples
      let topExamples = [];
      try{
        if(Array.isArray(item.reviews) && item.reviews.length > 0){
          const texts = [out].concat(item.reviews.slice(0, 20));
          const embs = await callProdBertEmbed(texts);
          if(embs && embs.length === texts.length){
            const q = embs[0];
            // compute simple cosine similarities
            const sims = embs.slice(1).map(e => {
              const dot = e.reduce((acc, v, i) => acc + v * (q[i]||0), 0);
              const normE = Math.sqrt(e.reduce((a,v)=>a+v*v,0));
              const normQ = Math.sqrt(q.reduce((a,v)=>a+v*v,0));
              return (normE && normQ) ? dot/(normE*normQ) : 0;
            });
            // pick top 3
            const idxs = sims.map((s,i)=>[s,i]).sort((a,b)=>b[0]-a[0]).slice(0,3).map(x=>x[1]);
            topExamples = idxs.map(i => item.reviews[i]);
          }
        }
      }catch(e){
        // non-fatal
      }

      summaries.push({ product_name: item.product_name, profile_raw: out, topExamples });
    }

    return res.json({ summaries });
  }catch(e){
    return res.status(500).json({ error: String(e) });
  }
});

// Reduce: produce seller identity from profiles
app.post('/summaries/reduce', async (req, res) => {
  try{
    const { profiles, sellerId } = req.body;
    if(!Array.isArray(profiles)) return res.status(400).json({ error: 'profiles array required' });

    const prompt = `ACT AS A SENIOR BUSINESS AUDITOR. Analyze these product profiles for a single seller: ${JSON.stringify(profiles)}\nProduce a Seller Identity Report describing operational patterns, customer centricity, systematic risks, and grandma_score.`;
    let out = null;
    try{
      if(COHERE_API_KEY){
        const r = await callCohere(prompt, { max_tokens: 512 });
        out = r?.generations?.[0]?.text || JSON.stringify({ error: 'no response' });
      } else if(GEMINI_ENDPOINT){
        const r = await callGemini(prompt, { max_tokens: 512 });
        out = r?.content || JSON.stringify({ error: 'no response' });
      } else {
        out = JSON.stringify({ note: 'NO_LLM_CONFIGURED' });
      }
    }catch(e){
      out = JSON.stringify({ error: String(e) });
    }

    // Try to parse structured JSON from the LLM output if possible
    let parsed = safeParseJSON(out);
    let aiGeneratedSummary = null;
    let topComplaintThemes = null;
    let sentimentScore = null;
    let grandmaScore = null;
    let summaryPeriodStart = null;
    let summaryPeriodEnd = null;

    if(parsed){
      aiGeneratedSummary = parsed.aiGeneratedSummary || parsed.ai_generated_summary || parsed.summary || out;
      topComplaintThemes = parsed.topComplaintThemes || parsed.top_complaint_themes || parsed.themes || null;
      sentimentScore = parsed.sentimentScore || parsed.sentiment_score || parsed.sentiment || null;
      grandmaScore = parsed.grandmaScore || parsed.grandma_score || parsed.grandma || null;
      summaryPeriodStart = parsed.summaryPeriodStart || parsed.summary_period_start || null;
      summaryPeriodEnd = parsed.summaryPeriodEnd || parsed.summary_period_end || null;
    } else {
      // fallback: store raw string as summary
      aiGeneratedSummary = out;
    }

    // Persist to Postgres if configured and sellerId provided
    let stored = null;
    try{
      if(pgPool && sellerId){
        const insertSql = `INSERT INTO public.seller_performance_summaries (seller_id, ai_generated_summary, top_complaint_themes, sentiment_score, grandma_score, summary_period_start, summary_period_end) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) RETURNING id, created_at`;
        const vals = [sellerId, aiGeneratedSummary, topComplaintThemes ? JSON.stringify(topComplaintThemes) : null, sentimentScore, grandmaScore, summaryPeriodStart, summaryPeriodEnd];
        const r = await pgPool.query(insertSql, vals);
        stored = r.rows[0];
      }
    }catch(err){
      console.error('failed to persist summary', err);
    }

    return res.json({ seller_report: out, parsed, stored });
  }catch(e){
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ----------------------------------------------------------------------
// PHASE 3: AI-ASSISTED SELLER WORKFLOWS & ORCHESTRATION
// ----------------------------------------------------------------------

const crypto = require('crypto');

app.post('/agent/orchestrate', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const startTime = Date.now();
  let provider = process.env.GITHUB_TOKEN ? 'notebook-graph' : 'mock-notebook-graph';
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

  const latencyMs = Date.now() - startTime;

  // Audit trace in MongoDB
  try {
    await AgentExecutionTrace.create({
      trace_id: traceId,
      workflow: req.body.workflow || 'unknown',
      provider: provider,
      model: 'notebook-langgraph-port',
      latency_ms: latencyMs,
      status: status,
      reasoning_steps: reasoningSteps
    });
  } catch(e) {
    console.error('Failed to save AgentExecutionTrace', e);
  }

  if (status === 'error') return res.status(500).json({ error: out, trace_id: traceId });
  return res.json({ result: out, trace_id: traceId, reasoning_steps: reasoningSteps });
});

app.post('/ai/deep-search', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await runMyPalAgenticWorkflow(req.body || {});
    return res.json({
      result: result.state.final_output,
      state: result.state,
      reasoning_steps: result.trace,
      trace_id: traceId
    });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

app.post('/ai/fast-search', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await fastSearchFeature(req.body.query || '');
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

app.post('/ai/translate', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await translateText(req.body.target_language, req.body.text);
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

app.post('/ai/summarize', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await summarizeContent(req.body.text || '', req.body.length || 'medium');
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

app.post('/ai/product/ask', async (req, res) => {
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

app.post('/ai/scraped/clean', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  try {
    const result = await cleanScrapedContent(req.body.raw_text || '');
    return res.json({ result, trace_id: traceId });
  } catch (err) {
    return res.status(500).json({ error: String(err), trace_id: traceId });
  }
});

app.post('/seller/listing/analyze', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  const startTime = Date.now();
  const { title, description, category, price } = req.body;
  let status = 'success';
  let out = null;

  try {
    const prompt = `Analyze this product listing for completeness, policy violations, and SEO:
Title: ${title}
Desc: ${description}
Category: ${category}
Price: ${price}
Return a JSON with "is_valid" (boolean), "confidence_score" (0-1), "suggestions" (array), "flags" (array).`;
    
    let rawResult = null;
    if (COHERE_API_KEY) {
      const r = await callCohere(prompt);
      rawResult = r?.generations?.[0]?.text;
    } else if (GEMINI_ENDPOINT) {
      const r = await callGemini(prompt);
      rawResult = r?.content;
    } else {
      rawResult = '{"is_valid": true, "confidence_score": 0.9, "suggestions": [], "flags": []}';
    }
    
    out = safeParseJSON(rawResult) || { is_valid: true, confidence_score: 0.5, suggestions: [], flags: [] };
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
      notes: JSON.stringify(out)
    });
  } catch(e) {
    console.error('Failed to save AgenticValidationLog', e);
  }

  res.json({ ...out, trace_id: traceId });
});

app.post('/seller/report/generate', async (req, res) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  // Simplified for Phase 3. Real impl would fetch metrics from Postgres and summarize.
  res.json({
    report_url: 'https://mypal.app/reports/demo.pdf',
    summary: 'Report generated successfully.',
    trace_id: traceId
  });
});

app.listen(PORT, () => console.log(`LLM orchestrator listening on ${PORT}`));

// Demo endpoint returning a seller performance summary (placeholder)
app.get('/seller-report/:sellerId', (req, res) => {
  const sellerId = req.params.sellerId;
  (async ()=>{
    if(pgPool){
      try{
        const r = await pgPool.query(`SELECT id, seller_id, ai_generated_summary, top_complaint_themes::text, sentiment_score, grandma_score, created_at, summary_period_start::text, summary_period_end::text FROM public.seller_performance_summaries WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1`, [sellerId]);
        if(r.rowCount === 0) return res.status(404).json({ error: 'not found' });
        const row = r.rows[0];
        let topThemes = [];
        try{ topThemes = row.top_complaint_themes ? JSON.parse(row.top_complaint_themes) : []; }catch(e){ topThemes = row.top_complaint_themes; }
        return res.json({ id: row.id, sellerId: row.seller_id, aiGeneratedSummary: row.ai_generated_summary, topComplaintThemes: topThemes, sentimentScore: row.sentiment_score, grandmaScore: row.grandma_score, createdAt: row.created_at, summaryPeriodStart: row.summary_period_start, summaryPeriodEnd: row.summary_period_end });
      }catch(e){
        console.error('seller-report db error', e);
        return res.status(500).json({ error: String(e) });
      }
    }
    // fallback demo
    const demo = {
      id: `summary-${sellerId}`,
      sellerId,
      summaryPeriodStart: new Date().toISOString(),
      summaryPeriodEnd: new Date().toISOString(),
      aiGeneratedSummary: "Seller shows inconsistent fulfillment times; overall trust tier: trusted. Grandma score: 7/10.",
      topComplaintThemes: ["Late shipping", "Packaging quality"],
      sentimentScore: 0.72,
      createdAt: new Date().toISOString(),
    };
    res.json(demo);
  })();
});
