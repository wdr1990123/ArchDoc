import { apiGet, apiPost } from "@/lib/api/client";

const DEFAULT_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 2_000;

export type DiagnoseJobStatus = {
  status: string;
  error_message: string | null;
  result?: { report_id?: string };
};

/** Poll job status; kick background worker when pending (never blocks on LLM). */
export async function waitForDiagnoseJob(
  jobId: string,
  options?: { timeoutMs?: number; onPoll?: () => void }
): Promise<string | undefined> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { job } = await apiGet<{ job: DiagnoseJobStatus }>(`/api/v1/jobs/${jobId}`);
    options?.onPoll?.();

    if (job.status === "completed") return job.result?.report_id;
    if (job.status === "failed") {
      throw new Error(job.error_message ?? "AI 诊断失败");
    }

    if (job.status === "pending") {
      try {
        await apiPost("/api/v1/jobs/poll", { job_id: jobId });
      } catch {
        /* kick is best-effort */
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("诊断超时，请稍后在扫描页查看历史报告是否已生成");
}

export async function runDiagnoseAndWait(
  scanId: string,
  body: Record<string, unknown> = {},
  options?: { timeoutMs?: number }
): Promise<{ jobId: string; reportId?: string }> {
  const res = await apiPost<{ job_id: string; report_id?: string }>(
    `/api/v1/scans/${scanId}/diagnose`,
    body
  );
  const reportId =
    res.report_id ?? (await waitForDiagnoseJob(res.job_id, { timeoutMs: options?.timeoutMs }));
  return { jobId: res.job_id, reportId };
}
