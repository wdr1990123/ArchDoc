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
const baseUrl = process.env.DATABASE_URL?.split("?")[0];

if (!baseUrl) {
  console.error("DATABASE_URL not set. Copy web/.env.example to web/.env.local first.");
  process.exit(1);
}

const migrationFile = process.argv[2] ?? "003_domain_name_unique.sql";
const sqlPath = path.resolve(__dirname, `../../db/migrations/${migrationFile}`);

if (!fs.existsSync(sqlPath)) {
  console.error(`Migration not found: ${sqlPath}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: baseUrl });

try {
  await client.connect();
  await client.query(`SET search_path TO "${schema}"`);
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`Running ${migrationFile}...`);
  await client.query(sql);
  const count = await client.query(`SELECT COUNT(*)::int AS n FROM diagnosis_domains`);
  console.log(`OK. diagnosis_domains: ${count.rows[0].n} rows`);
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
