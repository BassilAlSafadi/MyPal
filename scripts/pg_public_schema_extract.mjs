import { readFile, writeFile } from "node:fs/promises";

const snapshotPath = process.argv[2] || "scripts/pg_schema_snapshot.json";
const raw = await readFile(snapshotPath, "utf8");
const snap = JSON.parse(raw);

const isPublic = (r) => r.table_schema === "public";
const publicTables = new Set(
  snap.tables.filter(isPublic).map((t) => t.table_name),
);

const columnsByTable = {};
for (const c of snap.columns.filter(isPublic)) {
  const key = c.table_name;
  columnsByTable[key] ||= [];
  columnsByTable[key].push(c);
}

const pkByTable = {};
for (const k of snap.primaryKeys.filter(isPublic)) {
  pkByTable[k.table_name] ||= [];
  pkByTable[k.table_name].push(k);
}

const fksByTable = {};
for (const fk of snap.foreignKeys.filter(isPublic)) {
  fksByTable[fk.table_name] ||= [];
  fksByTable[fk.table_name].push(fk);
}

const out = {
  generatedAt: snap.generatedAt,
  tables: Array.from(publicTables).sort(),
  columnsByTable,
  pkByTable,
  fksByTable,
};

const outPath = "scripts/pg_public_schema.json";
await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(`Wrote ${outPath} (${out.tables.length} public tables)`);

