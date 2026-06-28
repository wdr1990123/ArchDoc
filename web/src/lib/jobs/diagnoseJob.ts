import { query, queryOne } from "@/lib/db/client";
import { createLlmProvider } from "@/lib/llm/provider";
import { buildDiagnosisPrompt, reportToMarkdown } from "@/lib/llm/prompts";
import {
  buildEvidenceIndex,
  getIssuesForScan,
  getMetricsForScan,
  getScanOverview,
  getSummariesForScan,
} from "@/lib/metrics/scanMetrics";
import { computeStranglerCandidates } from "@/lib/db/federation";
import { getRepositoryForScanRun } from "@/lib/db/queries";
import { parseReportJson, validateReport } from "@/lib/validation/reportValidator";
import type { AiReportContent } from "@/lib/types";

export async function enqueueDiagnoseJob(scanRunId: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO job_queue (kind, payload) VALUES ('ai_diagnose', $1) RETURNING id`,
    [JSON.stringify({ scan_run_id: scanRunId })]
  );
  if (!row) throw new Error("Failed to enqueue job");
  return row.id;
}

export async function processDiagnoseJob(scanRunId: string): Promise<string> {
  const overview = await getScanOverview(scanRunId);
  if (!overview) throw new Error("Scan run not found");

  const repo = await getRepositoryForScanRun(scanRunId);
  const metrics = await getMetricsForScan(scanRunId);
  const issues = await getIssuesForScan(scanRunId);
  const summaries = await getSummariesForScan(scanRunId);
  const strangler = await computeStranglerCandidates(scanRunId);

  const reportRow = await queryOne<{ id: string }>(
    `INSERT INTO diagnostic_reports (scan_run_id, status, report_type)
     VALUES ($1, 'running', 'project') RETURNING id`,
    [scanRunId]
  );
  if (!reportRow) throw new Error("Failed to create report");

  const evidenceIndex = buildEvidenceIndex(metrics, issues);
  for (const s of strangler) {
    evidenceIndex.set(`module:${s.module_name}`, true);
  }

  const { system, user } = buildDiagnosisPrompt({
    projectName: repo?.name ?? "Unknown",
    solutionPath: overview.scan.solution_path ?? "",
    healthScore: overview.healthScore,
    issueCounts: overview.issueCounts,
    topModules: overview.topRiskModules.map((m) => ({
      name: m.module.name,
      ce: m.ce,
      ca: m.ca,
      issueCount: m.issueCount,
    })),
    issues: issues.map((i) => ({
      id: i.id,
      rule_id: i.rule_id,
      severity: i.severity,
      message: i.message,
    })),
    metrics: metrics.map((m) => ({
      id: m.id,
      code: m.code,
      module_name: m.module_name,
      value: Number(m.value),
    })),
    summaries: summaries.map((s) => ({
      module_name: s.module_name,
      top_types: s.top_types as string[],
      snippet: s.snippet,
    })),
  });

  const llm = await createLlmProvider();
  let content: AiReportContent;
  let validationErrors: string[] = [];

  try {
    let raw = await llm.provider.chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { json: true }
    );
    content = parseReportJson(raw);

    if (!content.strangler_candidates?.length) {
      content.strangler_candidates = strangler.map((s) => ({
        module_name: s.module_name,
        score: s.score,
        rationale: s.rationale,
        evidence_refs: [`module:${s.module_name}`],
      }));
    }

    let validation = validateReport(content, evidenceIndex);
    if (!validation.valid) {
      raw = await llm.provider.chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `请修正 evidence_refs。错误：${validation.errors.join("；")}。仅返回修正后的 JSON，内容字段保持简体中文。`,
          },
        ],
        { json: true }
      );
      content = parseReportJson(raw);
      validation = validateReport(content, evidenceIndex);
      validationErrors = validation.errors;
    }

    const markdown = reportToMarkdown(content);
    const status = validationErrors.length ? "partial" : "completed";

    await query(
      `UPDATE diagnostic_reports
       SET status = $2, content = $3, validation_errors = $4, markdown = $5, finished_at = now()
       WHERE id = $1`,
      [
        reportRow.id,
        status,
        JSON.stringify(content),
        JSON.stringify(validationErrors),
        markdown,
      ]
    );

    for (const rec of content.refactoring_recommendations ?? []) {
      await query(
        `INSERT INTO refactoring_recommendations (report_id, effort, category, title, description, evidence_refs)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          reportRow.id,
          rec.effort,
          rec.category,
          rec.title,
          rec.description,
          JSON.stringify(rec.evidence_refs),
        ]
      );
    }

    return reportRow.id;
  } catch (error) {
    await query(
      `UPDATE diagnostic_reports SET status = 'failed', validation_errors = $2, finished_at = now() WHERE id = $1`,
      [
        reportRow.id,
        JSON.stringify([error instanceof Error ? error.message : "Unknown error"]),
      ]
    );
    throw error;
  }
}

type QueuedJob = {
  id: string;
  kind: string;
  payload: { scan_run_id?: string };
  attempts: number;
  max_attempts: number;
};

async function executeQueuedJob(job: QueuedJob): Promise<void> {
  try {
    if (job.kind === "ai_diagnose" && job.payload.scan_run_id) {
      const reportId = await processDiagnoseJob(job.payload.scan_run_id);
      await query(
        `UPDATE job_queue SET status = 'completed', result = $2, completed_at = now() WHERE id = $1`,
        [job.id, JSON.stringify({ report_id: reportId })]
      );
    } else {
      throw new Error(`Unknown job kind: ${job.kind}`);
    }
  } catch (error) {
    const failed = job.attempts >= job.max_attempts;
    await query(
      `UPDATE job_queue SET status = $2, error_message = $3, completed_at = CASE WHEN $4 THEN now() ELSE NULL END WHERE id = $1`,
      [
        job.id,
        failed ? "failed" : "pending",
        error instanceof Error ? error.message : "Unknown",
        failed,
      ]
    );
  }
}

/** Process a specific enqueued job (used by diagnose API so clicks are not blocked by older queue items). */
export async function processJobById(jobId: string, workerId: string): Promise<boolean> {
  const job = await queryOne<QueuedJob>(
    `UPDATE job_queue
     SET status = 'running', locked_at = now(), locked_by = $2, attempts = attempts + 1
     WHERE id = $1 AND status = 'pending' AND attempts < max_attempts
     RETURNING id, kind, payload, attempts, max_attempts`,
    [jobId, workerId]
  );

  if (!job) return false;

  await executeQueuedJob(job);
  return true;
}

export async function pollAndProcessJobs(workerId: string): Promise<number> {
  const job = await queryOne<QueuedJob>(
    `UPDATE job_queue
     SET status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
     WHERE id = (
       SELECT id FROM job_queue
       WHERE status = 'pending' AND attempts < max_attempts
       ORDER BY created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, kind, payload, attempts, max_attempts`,
    [workerId]
  );

  if (!job) return 0;

  await executeQueuedJob(job);
  return 1;
}

export async function getReport(reportId: string) {
  return queryOne(
    `SELECT dr.*,
       (SELECT json_agg(r ORDER BY r.title)
        FROM refactoring_recommendations r WHERE r.report_id = dr.id) AS recommendations
     FROM diagnostic_reports dr WHERE dr.id = $1`,
    [reportId]
  );
}

export async function getReportsForScan(scanRunId: string) {
  return query<{
    id: string;
    status: string;
    report_type: string;
    created_at: string;
    finished_at: string | null;
  }>(
    `SELECT id, status, report_type, created_at, finished_at FROM diagnostic_reports
     WHERE scan_run_id = $1 ORDER BY created_at DESC`,
    [scanRunId]
  );
}

export async function getJob(jobId: string) {
  return queryOne(`SELECT * FROM job_queue WHERE id = $1`, [jobId]);
}
