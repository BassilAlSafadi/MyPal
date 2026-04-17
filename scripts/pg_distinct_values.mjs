import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: process.argv[2] || ".env" });

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DIRECT_URL ||
  process.env.DIRECT_URL;

if (!connectionString) {
  console.error("Missing connection string in env file.");
  process.exit(1);
}

const targets = [
  { table: "public.products", column: "discriminator" },
  { table: "public.orders", column: "status" },
  { table: "public.support_tickets", column: "status" },
  { table: "public.support_tickets", column: "priority" },
];

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function distinct(table, column) {
  const q = `select distinct ${column} as v from ${table} where ${column} is not null order by ${column} limit 100;`;
  const { rows } = await client.query(q);
  return rows.map((r) => r.v);
}

try {
  await client.connect();
  const out = {};
  for (const t of targets) {
    out[`${t.table}.${t.column}`] = await distinct(t.table, t.column);
  }
  console.log(JSON.stringify(out, null, 2));
} finally {
  try {
    await client.end();
  } catch {
    // ignore
  }
}

