// Local embedding service for MyPal's semantic search.
//
// Satisfies the contract Backend/CSharp/MyPal.Listings/Search/SemanticSearch.cs
// expects from PRODBERT_URL: POST /embed with {"texts": [...]} returns
// {"embeddings": [[...384 floats...], ...]}.
//
// Uses @xenova/transformers (ONNX runtime) to run the ONNX conversion of
// sentence-transformers/paraphrase-MiniLM-L3-v2 fully locally — no Python,
// no torch, no external API key. Output is 384-dimensional, matching the
// product_embeddings.embedding vector(384) column.
import http from 'node:http';
import { pipeline } from '@xenova/transformers';

const PORT = Number(process.env.PRODBERT_PORT || 8001);
const MODEL = 'Xenova/paraphrase-MiniLM-L3-v2';

console.log(`[prodbert] loading ${MODEL}...`);
const extractor = await pipeline('feature-extraction', MODEL);
console.log('[prodbert] model ready');

async function embed(texts) {
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  // output.dims = [batchSize, 384]; output.tolist() gives the nested array form.
  return output.tolist();
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'prodbert', model: MODEL }));
    return;
  }

  if (req.method === 'POST' && req.url === '/embed') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { texts } = JSON.parse(body || '{}');
        if (!Array.isArray(texts) || texts.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'texts array required' }));
          return;
        }
        const embeddings = await embed(texts);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ embeddings }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err?.message || err) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[prodbert] listening on :${PORT}`);
});
