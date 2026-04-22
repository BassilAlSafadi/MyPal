import dotenv from "dotenv";
import { Client } from "pg";
import { writeFile } from "node:fs/promises";

dotenv.config({ path: process.argv[2] || ".env" });

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DIRECT_URL ||
  process.env.DIRECT_URL;

if (!connectionString) {
  console.error("Missing SUPABASE_DB_URL/DATABASE_URL in env file.");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

function rowKey(schema, table) {
  return `${schema}.${table}`;
}

async function main() {
  await client.connect();

  const { rows: tables } = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name;
  `);

  const { rows: columns } = await client.query(`
    select
      table_schema,
      table_name,
      column_name,
      ordinal_position,
      is_nullable,
      data_type,
      udt_schema,
      udt_name,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      datetime_precision,
      column_default
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name, ordinal_position;
  `);

  const { rows: pk } = await client.query(`
    select
      tc.table_schema,
      tc.table_name,
      kcu.column_name,
      kcu.ordinal_position as key_ordinal,
      tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
      and tc.table_name = kcu.table_name
    where tc.constraint_type = 'PRIMARY KEY'
      and tc.table_schema not in ('pg_catalog', 'information_schema')
    order by tc.table_schema, tc.table_name, kcu.ordinal_position;
  `);

  const { rows: fks } = await client.query(`
    select
      tc.table_schema,
      tc.table_name,
      kcu.column_name,
      ccu.table_schema as foreign_table_schema,
      ccu.table_name as foreign_table_name,
      ccu.column_name as foreign_column_name,
      rc.update_rule,
      rc.delete_rule,
      tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name
      and rc.constraint_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
      and ccu.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema not in ('pg_catalog', 'information_schema')
    order by tc.table_schema, tc.table_name, tc.constraint_name;
  `);

  const { rows: enums } = await client.query(`
    select
      n.nspname as enum_schema,
      t.typname as enum_name,
      e.enumlabel as enum_value,
      e.enumsortorder as sort_order
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
    order by n.nspname, t.typname, e.enumsortorder;
  `);

  const out = {
    generatedAt: new Date().toISOString(),
    tables,
    columns,
    primaryKeys: pk,
    foreignKeys: fks,
    enums,
  };

  const outPath = "scripts/pg_schema_snapshot.json";
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${outPath} (${tables.length} tables)`);
}

try {
  await main();
} finally {
  try {
    await client.end();
  } catch {
    // ignore
  }
}

