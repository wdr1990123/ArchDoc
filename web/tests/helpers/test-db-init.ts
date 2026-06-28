import fs from "fs";
import path from "path";
import pg from "pg";

/** 为独立测试 schema 执行迁移（仅当配置了 DATABASE_URL_TEST 时调用）。 */
export async function ensureTestSchemaReady(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize test schema");
  }

  const schema = process.env.ARCHDOC_PG_SCHEMA ?? "ArchDoc_test";
  const baseUrl = connectionString.split("?")[0];
  const client = new pg.Client({ connectionString: baseUrl });
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);

    const migrationsDir = path.resolve(__dirname, "../../../db/migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
    }

    console.log(`[test] schema "${schema}" ready (${files.length} migration(s))`);
  } finally {
    await client.end();
  }
}
