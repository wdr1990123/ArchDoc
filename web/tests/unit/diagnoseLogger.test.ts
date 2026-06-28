import { mkdtempSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDiagnoseRunLogger,
  formatMessagesForLog,
  resolveDiagnoseLogDir,
  resolveRepoRoot,
} from "@/lib/jobs/diagnoseLogger";

describe("diagnoseLogger", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes info, section blocks, and finalize", () => {
    const prev = process.env.DIAGNOSE_LOG_ENABLED;
    process.env.DIAGNOSE_LOG_ENABLED = "true";
    tempDir = mkdtempSync(join(tmpdir(), "diagnose-log-"));
    try {
      const log = createDiagnoseRunLogger({
        jobId: "12345678-abcd-efgh-ijkl-mnopqrstuvwx",
        scanRunId: "scan-1",
        reportType: "project",
        logDir: tempDir,
      });

      log.info("job_start", { report_type: "project" });
      log.section("PROMPT system", "hello system");
      log.setReportId("abcdef12-3456-7890-abcd-ef1234567890");
      log.finalize("completed", { report_id: "abcdef12-3456-7890-abcd-ef1234567890" });

      const content = readFileSync(log.filePath, "utf8");
      expect(content).toContain("phase=job_start");
      expect(content).toContain("--- BEGIN PROMPT system ---");
      expect(content).toContain("hello system");
      expect(content).toContain("--- END PROMPT system ---");
      expect(content).toContain("=== RUN END ===");
      expect(content).toContain("outcome=completed");
      expect(log.filePath).toContain("abcdef12");
    } finally {
      if (prev === undefined) delete process.env.DIAGNOSE_LOG_ENABLED;
      else process.env.DIAGNOSE_LOG_ENABLED = prev;
    }
  });

  it("returns no-op logger when disabled", () => {
    const prev = process.env.DIAGNOSE_LOG_ENABLED;
    process.env.DIAGNOSE_LOG_ENABLED = "false";
    try {
      const log = createDiagnoseRunLogger({
        scanRunId: "scan-1",
        logDir: "/tmp/should-not-write",
      });
      expect(log.filePath).toBe("");
      log.info("ignored");
      log.finalize("failed");
    } finally {
      if (prev === undefined) delete process.env.DIAGNOSE_LOG_ENABLED;
      else process.env.DIAGNOSE_LOG_ENABLED = prev;
    }
  });

  it("formatMessagesForLog includes roles", () => {
    const text = formatMessagesForLog([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
    expect(text).toContain("role=system");
    expect(text).toContain("role=user");
  });

  it("resolveDiagnoseLogDir points under repo root", () => {
    const dir = resolveDiagnoseLogDir();
    expect(dir).toContain(join("logs", "diagnose"));
    expect(resolveRepoRoot()).toBeTruthy();
  });
});
