import fs from "fs";
import path from "path";
import pg from "pg";
import type { LlmSettings } from "@/lib/llm/types";

const SETTINGS_KEY = "llm_profiles";
const BACKUP_FILE = path.resolve(__dirname, "../../test-reports/.llm-settings-backup.json");

interface LlmSettingsBackup {
  exists: boolean;
  value: LlmSettings | null;
  backedUpAt: string;
}

function getClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new pg.Client({ connectionString });
}

/** 测试开始前备份当前 LLM 配置（仅在使用开发库时）。 */
export async function backupLlmSettings(): Promise<void> {
  const client = getClient();
  await client.connect();
  try {
    const result = await client.query<{ value: LlmSettings }>(
      `SELECT value FROM app_settings WHERE key = $1`,
      [SETTINGS_KEY]
    );
    const backup: LlmSettingsBackup = {
      exists: result.rowCount > 0,
      value: result.rows[0]?.value ?? null,
      backedUpAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2), "utf8");
    console.log(
      `[test] backed up LLM settings (${backup.exists ? backup.value?.profiles?.length ?? 0 : 0} profile(s))`
    );
  } finally {
    await client.end();
  }
}

/** 测试结束后恢复 LLM 配置。 */
export async function restoreLlmSettings(): Promise<void> {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.warn("[test] no LLM settings backup found, skip restore");
    return;
  }

  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8")) as LlmSettingsBackup;
  const client = getClient();
  await client.connect();
  try {
    if (backup.exists && backup.value) {
      await client.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [SETTINGS_KEY, JSON.stringify(backup.value)]
      );
      console.log(
        `[test] restored LLM settings (${backup.value.profiles?.length ?? 0} profile(s))`
      );
    } else {
      await client.query(`DELETE FROM app_settings WHERE key = $1`, [SETTINGS_KEY]);
      console.log("[test] restored LLM settings (cleared — none existed before tests)");
    }
  } finally {
    await client.end();
    fs.unlinkSync(BACKUP_FILE);
  }
}
