import fs from "fs";
import path from "path";

export function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../../.env.local");
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

/** 测试进程启动时加载环境；若配置了 DATABASE_URL_TEST 则切换到独立 schema。 */
export function applyTestEnv() {
  loadEnvLocal();

  const testDbUrl = process.env.DATABASE_URL_TEST?.trim();
  if (testDbUrl) {
    process.env.DATABASE_URL = testDbUrl;
    const testSchema = process.env.ARCHDOC_PG_SCHEMA_TEST?.trim();
    if (testSchema) {
      process.env.ARCHDOC_PG_SCHEMA = testSchema;
    }
  }

  if (!process.env.ARCHDOC_API_KEY) {
    process.env.ARCHDOC_API_KEY = "dev-secret-key";
  }

  if (!process.env.JOB_WORKER_ENABLED) {
    process.env.JOB_WORKER_ENABLED = "true";
  }
}

export function usesIsolatedTestDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL_TEST?.trim());
}
