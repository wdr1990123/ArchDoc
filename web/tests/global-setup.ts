import { cleanupTestDomains, closeTestDbPool } from "./helpers/test-cleanup";
import { backupLlmSettings, restoreLlmSettings } from "./helpers/llm-settings-backup";
import { ensureTestSchemaReady } from "./helpers/test-db-init";
import { applyTestEnv, usesIsolatedTestDatabase } from "./helpers/test-env";

export default async function globalSetup() {
  applyTestEnv();

  const isolated = usesIsolatedTestDatabase();

  if (isolated) {
    console.log("[test] using isolated test database (DATABASE_URL_TEST)");
    await ensureTestSchemaReady();
  } else if (process.env.DATABASE_URL) {
    console.log("[test] using dev database — LLM settings will be backed up and restored");
    await backupLlmSettings();
  }

  if (process.env.DATABASE_URL) {
    const leftover = await cleanupTestDomains();
    if (leftover > 0) {
      console.log(`[test cleanup] removed ${leftover} leftover test domain(s) before run`);
    }
  }

  return async () => {
    if (!process.env.DATABASE_URL) return;

    try {
      const deleted = await cleanupTestDomains();
      if (deleted > 0) {
        console.log(`[test cleanup] removed ${deleted} test domain(s) after run`);
      }

      if (!isolated) {
        await restoreLlmSettings();
      }
    } finally {
      await closeTestDbPool();
    }
  };
}
