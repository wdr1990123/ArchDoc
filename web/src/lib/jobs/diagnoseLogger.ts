import { appendFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

export type DiagnoseRunLogger = {
  info(phase: string, fields?: Record<string, unknown>): void;
  error(phase: string, err: unknown, fields?: Record<string, unknown>): void;
  section(title: string, body: string): void;
  time<T>(
    phase: string,
    fn: () => Promise<T>,
    fields?: Record<string, unknown>
  ): Promise<T>;
  finalize(outcome: "completed" | "partial" | "failed", fields?: Record<string, unknown>): void;
  setReportId(reportId: string): void;
  filePath: string;
};

export type CreateDiagnoseRunLoggerOptions = {
  jobId?: string;
  scanRunId: string;
  reportType?: string;
  moduleName?: string;
  logDir?: string;
};

const noopLogger: DiagnoseRunLogger = {
  info() {},
  error() {},
  section() {},
  async time(_phase, fn) {
    return fn();
  },
  finalize() {},
  setReportId() {},
  filePath: "",
};

function isLoggingEnabled(): boolean {
  const v = process.env.DIAGNOSE_LOG_ENABLED;
  if (v === undefined) return true;
  return v !== "false" && v !== "0";
}

export function resolveRepoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "scanner"))) return cwd;
  if (existsSync(join(cwd, "..", "scanner"))) return join(cwd, "..");
  return join(cwd, "..");
}

export function resolveDiagnoseLogDir(override?: string): string {
  return override ?? join(resolveRepoRoot(), "logs", "diagnose");
}

function formatFields(fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) return "";
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}=${JSON.stringify(v)}`;
      }
      if (typeof v === "object") {
        return `${k}=${JSON.stringify(v)}`;
      }
      const s = String(v);
      const escaped = s.includes(" ") || s.includes("=") ? JSON.stringify(s) : s;
      return `${k}=${escaped}`;
    });
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function timestampSlug(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function buildLogFileName(jobId: string | undefined, reportSuffix: string): string {
  const slug = timestampSlug();
  const jobPart = jobId ? jobId.slice(0, 8) : "nojob";
  return `${slug}_${jobPart}_${reportSuffix}.log`;
}

function appendLine(filePath: string, line: string): void {
  appendFileSync(filePath, line + "\n", "utf8");
}

function appendSection(filePath: string, title: string, body: string): void {
  appendLine(filePath, `--- BEGIN ${title} ---`);
  appendFileSync(filePath, body, "utf8");
  if (!body.endsWith("\n")) appendFileSync(filePath, "\n", "utf8");
  appendLine(filePath, `--- END ${title} ---`);
}

export function logDiagnoseSystemEvent(
  phase: string,
  fields?: Record<string, unknown>
): void {
  if (!isLoggingEnabled()) return;
  const dir = resolveDiagnoseLogDir();
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "_system.log");
  const ts = new Date().toISOString();
  const line = `${ts} [INFO] phase=${phase}${formatFields(fields)}`;
  appendLine(filePath, line);
  console.log(`[diagnose] ${phase}${formatFields(fields)}`);
}

export function createDiagnoseRunLogger(
  options: CreateDiagnoseRunLoggerOptions
): DiagnoseRunLogger {
  if (!isLoggingEnabled()) return noopLogger;

  const dir = resolveDiagnoseLogDir(options.logDir);
  mkdirSync(dir, { recursive: true });

  const startedAt = Date.now();
  let reportSuffix = "pending";
  let filePath = join(dir, buildLogFileName(options.jobId, reportSuffix));
  let finalized = false;

  const write = (level: "INFO" | "ERROR", phase: string, extra?: string) => {
    const ts = new Date().toISOString();
    const line = `${ts} [${level}] phase=${phase}${extra ?? ""}`;
    appendLine(filePath, line);
    if (level === "ERROR") {
      console.error(`[diagnose] ${phase}${extra ?? ""}`);
    } else {
      console.log(`[diagnose] ${phase}${extra ?? ""}`);
    }
  };

  write("INFO", "logger_created", formatFields({
    job_id: options.jobId,
    scan_run_id: options.scanRunId,
    report_type: options.reportType,
    module_name: options.moduleName,
    log_path: filePath,
  }));

  return {
    get filePath() {
      return filePath;
    },

    info(phase, fields) {
      write("INFO", phase, formatFields(fields));
    },

    error(phase, err, fields) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error && err.stack ? err.stack : undefined;
      write("ERROR", phase, formatFields({ ...fields, error: message }));
      if (stack) {
        appendSection(filePath, `${phase} stack`, stack);
      }
    },

    section(title, body) {
      appendSection(filePath, title, body);
    },

    async time(phase, fn, fields) {
      const start = Date.now();
      try {
        const result = await fn();
        write("INFO", phase, formatFields({ ...fields, duration_ms: Date.now() - start }));
        return result;
      } catch (err) {
        write("ERROR", phase, formatFields({
          ...fields,
          duration_ms: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        }));
        throw err;
      }
    },

    setReportId(reportId: string) {
      if (reportSuffix !== "pending") return;
      const newName = buildLogFileName(options.jobId, reportId.slice(0, 8));
      const newPath = join(dir, newName);
      if (newPath !== filePath && existsSync(filePath)) {
        renameSync(filePath, newPath);
        filePath = newPath;
      }
      reportSuffix = reportId.slice(0, 8);
      write("INFO", "report_id_set", formatFields({ report_id: reportId, log_path: filePath }));
    },

    finalize(outcome, fields) {
      if (finalized) return;
      finalized = true;
      appendLine(filePath, "=== RUN END ===");
      write("INFO", "run_end", formatFields({
        outcome,
        total_duration_ms: Date.now() - startedAt,
        log_path: filePath,
        ...fields,
      }));
    },
  };
}

export function formatMessagesForLog(
  messages: Array<{ role: string; content: string }>
): string {
  return messages
    .map((m) => `=== role=${m.role} ===\n${m.content}`)
    .join("\n\n");
}
