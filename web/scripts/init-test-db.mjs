import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.ARCHDOC_PG_SCHEMA =
  process.env.ARCHDOC_PG_SCHEMA_TEST?.trim() || "ArchDoc_test";

const result = spawnSync("node", [path.join(__dirname, "init-db.mjs")], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
