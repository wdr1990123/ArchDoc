import pg from "pg";
import { loadEnvFiles } from "./lib/load-env.mjs";

loadEnvFiles();

const urls = [
  process.env.DATABASE_URL,
  "postgresql://postgres:postgres@localhost:5432/postgres",
  "postgresql://postgres@localhost:5432/postgres",
].filter(Boolean);

for (const url of [...new Set(urls)]) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const v = await client.query("SELECT version()");
    console.log(`OK ${url.replace(/:[^:@]+@/, ":***@")}`);
    console.log(`  ${v.rows[0].version.slice(0, 60)}`);
    const db = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'archdoc'"
    );
    console.log(`  archdoc database: ${db.rowCount > 0 ? "exists" : "missing"}`);
    if (db.rowCount > 0) {
      await client.end();
      const archdoc = new pg.Client({
        connectionString: url.replace(/\/[^/]+$/, "/archdoc"),
      });
      await archdoc.connect();
      const tables = await archdoc.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' LIMIT 5"
      );
      console.log(`  tables: ${tables.rows.map((r) => r.tablename).join(", ") || "none"}`);
      await archdoc.end();
    }
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`FAIL ${url.replace(/:[^:@]+@/, ":***@")}: ${e.message}`);
    try {
      await client.end();
    } catch {}
  }
}
process.exit(1);
