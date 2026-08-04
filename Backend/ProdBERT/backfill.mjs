// One-off backfill: computes an embedding for every product missing one in
// public.product_embeddings, via the local ProdBERT service (must be running
// on PRODBERT_URL first — this uses the exact same model as query-time
// embedding, which is required for cosine similarity to mean anything).
//
// Usage: LISTINGS_POSTGRES_URL=... PRODBERT_URL=http://localhost:8001 node backfill.mjs
import pg from 'pg';

const PRODBERT_URL = process.env.PRODBERT_URL || 'http://localhost:8001';
const connectionString = process.env.LISTINGS_POSTGRES_URL;
if (!connectionString) {
  console.error('LISTINGS_POSTGRES_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: products } = await client.query(`
  SELECT p.id, p.name, COALESCE(p.description, '') AS description
  FROM public.products p
  LEFT JOIN public.product_embeddings pe ON pe.product_id = p.id
  WHERE p.is_deleted IS NOT TRUE AND pe.product_id IS NULL
`);

console.log(`${products.length} products need embeddings`);

for (const p of products) {
  const text = `${p.name}. ${p.description}`.trim();
  const res = await fetch(`${PRODBERT_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [text] }),
  });
  if (!res.ok) {
    console.error(`embed failed for ${p.name}: HTTP ${res.status}`);
    continue;
  }
  const { embeddings } = await res.json();
  const vectorLiteral = '[' + embeddings[0].join(',') + ']';

  await client.query(
    `INSERT INTO public.product_embeddings (product_id, embedding, updated_at)
     VALUES ($1, $2::vector, now())
     ON CONFLICT (product_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()`,
    [p.id, vectorLiteral],
  );
  console.log(`embedded: ${p.name}`);
}

await client.end();
console.log('done');
