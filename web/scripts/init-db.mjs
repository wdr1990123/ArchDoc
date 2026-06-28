import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();
const schema = process.env.ARCHDOC_PG_SCHEMA ?? "ArchDoc";
const baseUrl =
  process.env.DATABASE_URL?.split("?")[0] ??
  "postgresql://postgres:jhnzNo.13y15@localhost:5432/postgres";

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
