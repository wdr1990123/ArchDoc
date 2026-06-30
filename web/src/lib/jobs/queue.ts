import { query, queryOne } from "@/lib/db/client";
import { createLlmProvider, type LlmChatOptions, type LlmMessage } from "@/lib/llm/provider";
import {
  buildDiagnosisPrompt,
  buildModuleIntentPrompt,
  buildModuleRolesBatchPrompt,
  enrichReportContent,
  getMissingModuleNames,
  mergeModuleRoles,
  MODULE_BATCH_SIZE,
  reportToMarkdown,
  type ReportIssueInput,
} from "@/lib/llm/prompts";
import { normalizeLlmError } from "@/lib/llm/errors";
import {
  buildModuleContextPack,
  indexAllModuleTypeEvidence,
  indexModuleTypeEvidence,
} from "@/lib/metrics/moduleContextPack";
import {
  getIssuesForScan,
  getMetricsForScan,
  getModulesForScan,
  getScanOverview,
  getSummariesForScan,
  getModuleDeepFactsForScan,
} from "@/lib/metrics/scanMetrics";
import {
  buildStructureFacts,
  filterStructureFactsForModule,
} from "@/lib/metrics/structureFacts";
import { buildExtendedEvidenceIndex } from "@/lib/evidence/catalog";
import { finalizeGovernanceContent } from "@/lib/governance/governancePlan";
import {
  compactModuleIntentRollupForPrompt,
  loadModuleIntentRollup,
} from "@/lib/governance/moduleIntentRollup";
import { computeStranglerCandidates } from "@/lib/db/federation";
import { getRepositoryForScanRun } from "@/lib/db/queries";
import {
  extractModuleRolesFromLlmJson,
  ensureDesignHypotheses,
  isParseTruncationError,
  normalizeReportEvidenceRefs,
  parseReportJson,
  syncEvidenceRefs,
  validateReport,
  sanitizeModuleRoles,
  sanitizeRefactoringRecommendations,
  sanitizeQuickWins,
} from "@/lib/validation/reportValidator";
import type { AiReportContent, ModuleRoleEntry } from "@/lib/types";
import {
  createDiagnoseRunLogger,
  formatMessagesForLog,
  logDiagnoseSystemEvent,
  type DiagnoseRunLogger,
} from "@/lib/jobs/diagnoseLogger";


import { processDiagnoseJob } from "./diagnosePipeline";
import type { DiagnoseJobPayload } from "@/lib/types";

export async function enqueueDiagnoseJob(
  scanRunId: string,
  options?: Omit<DiagnoseJobPayload, "scan_run_id">
): Promise<string> {
  const payload: DiagnoseJobPayload = {
    scan_run_id: scanRunId,
    report_type: options?.report_type ?? "project",
    module_id: options?.module_id,
    module_name: options?.module_name,
  };
  const row = await queryOne<{ id: string }>(
    `INSERT INTO job_queue (kind, payload) VALUES ('ai_diagnose', $1) RETURNING id`,
    [JSON.stringify(payload)]
  );
  if (!row) throw new Error("Failed to enqueue job");
  logDiagnoseSystemEvent("job_enqueue", {
    job_id: row.id,
    scan_run_id: scanRunId,
    payload,
  });
  return row.id;
}

const STALE_RUNNING_SECONDS = Number(process.env.JOB_STALE_SECONDS ?? 180);

const ORPHAN_REPORT_MSG = "诊断中断：任务执行被中断，请重新生成";

/** In-process workers — if DB says running but id not here, the lock is orphaned */
const inFlightJobs = new Set<string>();

async function failOrphanedReportsForScan(
  scanRunId: string,
  since: string
): Promise<void> {
  await query(
    `UPDATE diagnostic_reports
     SET status = 'failed', validation_errors = $3, finished_at = COALESCE(finished_at, now())
     WHERE scan_run_id = $1 AND status = 'running'
       AND created_at >= $2::timestamptz - interval '2 minutes'`,
    [scanRunId, since, JSON.stringify([ORPHAN_REPORT_MSG])]
  );
}

/** Reset long-running locks so pending jobs can be picked up again */
export async function reclaimStaleRunningJobs(): Promise<number> {
  const stale = await query<{
    id: string;
    payload: DiagnoseJobPayload;
    created_at: string;
  }>(
    `UPDATE job_queue
     SET status = 'pending', locked_by = NULL, locked_at = NULL,
         error_message = COALESCE(error_message, 'reclaimed stale running lock')
     WHERE status = 'running'
       AND locked_at < now() - ($1 || ' seconds')::interval
       AND attempts < max_attempts
     RETURNING id, payload, created_at`,
    [String(STALE_RUNNING_SECONDS)]
  );
  for (const row of stale) {
    inFlightJobs.delete(row.id);
    logDiagnoseSystemEvent("job_reclaim_stale", {
      job_id: row.id,
      scan_run_id: row.payload.scan_run_id,
    });
    if (row.payload.scan_run_id) {
      await failOrphanedReportsForScan(row.payload.scan_run_id, row.created_at);
    }
  }
  return stale.length;
}

/** running in DB but no in-process worker (aborted HTTP / hot reload) */
async function reclaimOrphanedJob(jobId: string): Promise<boolean> {
  const row = await queryOne<{
    id: string;
    status: string;
    payload: DiagnoseJobPayload;
    created_at: string;
  }>(`SELECT id, status, payload, created_at FROM job_queue WHERE id = $1`, [jobId]);

  if (!row || row.status !== "running" || inFlightJobs.has(jobId)) return false;

  await query(
    `UPDATE job_queue
     SET status = 'pending', locked_by = NULL, locked_at = NULL,
         error_message = COALESCE(error_message, 'reclaimed orphaned running lock')
     WHERE id = $1 AND status = 'running'`,
    [jobId]
  );
  inFlightJobs.delete(jobId);
  logDiagnoseSystemEvent("job_reclaim_orphan", {
    job_id: jobId,
    scan_run_id: row.payload.scan_run_id,
  });
  if (row.payload.scan_run_id) {
    await failOrphanedReportsForScan(row.payload.scan_run_id, row.created_at);
  }
  return true;
}

function runJobInBackground(job: QueuedJob, workerId?: string): void {
  inFlightJobs.add(job.id);
  void executeQueuedJob(job, workerId)
    .catch((error) => {
      console.error(`[diagnose] job ${job.id} failed:`, error);
    })
    .finally(() => {
      inFlightJobs.delete(job.id);
    });
}

type QueuedJob = {
  id: string;
  kind: string;
  payload: DiagnoseJobPayload;
  attempts: number;
  max_attempts: number;
};

async function claimPendingJob(
  jobId: string,
  workerId: string
): Promise<QueuedJob | null> {
  const job = await queryOne<QueuedJob>(
    `UPDATE job_queue
     SET status = 'running', locked_at = now(), locked_by = $2, attempts = attempts + 1
     WHERE id = $1 AND status = 'pending' AND attempts < max_attempts
     RETURNING id, kind, payload, attempts, max_attempts`,
    [jobId, workerId]
  );
  if (job) {
    logDiagnoseSystemEvent("job_claim", {
      job_id: job.id,
      worker_id: workerId,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
    });
  }
  return job;
}

async function executeQueuedJob(job: QueuedJob, workerId?: string): Promise<void> {
  try {
    if (job.kind === "ai_diagnose" && job.payload.scan_run_id) {
      const reportId = await processDiagnoseJob(job.payload, {
        jobId: job.id,
        workerId,
      });
      await query(
        `UPDATE job_queue SET status = 'completed', result = $2, completed_at = now(), error_message = NULL WHERE id = $1`,
        [job.id, JSON.stringify({ report_id: reportId })]
      );
    } else {
      throw new Error(`Unknown job kind: ${job.kind}`);
    }
  } catch (error) {
    const failed = job.attempts >= job.max_attempts;
    await query(
      `UPDATE job_queue SET status = $2, error_message = $3,
              locked_by = NULL, locked_at = NULL,
              completed_at = CASE WHEN $4 THEN now() ELSE NULL END
       WHERE id = $1`,
      [
        job.id,
        failed ? "failed" : "pending",
        error instanceof Error ? error.message : "Unknown",
        failed,
      ]
    );
  }
}

/** Start diagnosis in the background — survives client disconnect / dev hot reload */
export async function startJobById(
  jobId: string,
  workerId: string
): Promise<"started" | "already_running" | "not_found"> {
  await reclaimStaleRunningJobs();

  if (inFlightJobs.has(jobId)) return "already_running";

  const existing = await queryOne<{ status: string }>(
    `SELECT status FROM job_queue WHERE id = $1`,
    [jobId]
  );
  if (!existing) return "not_found";
  if (existing.status === "completed" || existing.status === "failed") {
    return "not_found";
  }
  if (existing.status === "running") {
    if (await reclaimOrphanedJob(jobId)) {
      /* fall through to claim */
    } else {
      return "already_running";
    }
  }

  const job = await claimPendingJob(jobId, workerId);
  if (!job) {
    const after = await queryOne<{ status: string }>(
      `SELECT status FROM job_queue WHERE id = $1`,
      [jobId]
    );
    if (after?.status === "running") return "already_running";
    return "not_found";
  }

  runJobInBackground(job, workerId);
  return "started";
}

/** Process a specific enqueued job synchronously (tests / X-Job-Sync) */
export async function processJobById(jobId: string, workerId: string): Promise<boolean> {
  await reclaimStaleRunningJobs();
  if (inFlightJobs.has(jobId)) return false;

  const existing = await queryOne<{ status: string }>(
    `SELECT status FROM job_queue WHERE id = $1`,
    [jobId]
  );
  if (existing?.status === "running") {
    await reclaimOrphanedJob(jobId);
  }

  const job = await claimPendingJob(jobId, workerId);
  if (!job) return false;

  inFlightJobs.add(job.id);
  try {
    await executeQueuedJob(job, workerId);
    return true;
  } finally {
    inFlightJobs.delete(job.id);
  }
}

export async function pollAndProcessJobs(workerId: string): Promise<number> {
  await reclaimStaleRunningJobs();

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

  runJobInBackground(job, workerId);
  return 1;
}

