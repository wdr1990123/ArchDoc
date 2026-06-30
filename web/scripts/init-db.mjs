import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFiles } from "./lib/load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnvFiles(path.resolve(__dirname, ".."));

const schema = process.env.ARCHDOC_PG_SCHEMA ?? "ArchDoc";
const baseUrl = process.env.DATABASE_URL?.split("?")[0];

if (!baseUrl) {
  console.error("DATABASE_URL not set. Copy web/.env.example to web/.env.local first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: baseUrl });

async function run() {
  await client.connect();
  console.log("Connected to PostgreSQL");

  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  console.log(`Schema "${schema}" ready`);

  await client.query(`SET search_path TO "${schema}"`);

  const migrationsDir = path.resolve(__dirname, "../../db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Running ${file}...`);
    await client.query(sql);
    console.log(`  OK`);
  }

  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
    [schema]
  );
  console.log(`\nTables in "${schema}": ${tables.rows.map((r) => r.tablename).join(", ")}`);
  await client.end();
  console.log("\nDatabase initialization complete.");
}

run().catch((err) => {
  console.error("Init failed:", err.message);
  process.exit(1);
});
