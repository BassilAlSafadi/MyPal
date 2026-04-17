import s from "./pg_public_schema.json" with { type: "json" };

for (const t of s.tables) {
  const cols = s.columnsByTable[t].map((c) => ({
    name: c.column_name,
    type: c.data_type,
    udt: c.udt_name,
    nullable: c.is_nullable === "YES",
  }));
  console.log(`\n${t}:`);
  console.table(cols);
}

