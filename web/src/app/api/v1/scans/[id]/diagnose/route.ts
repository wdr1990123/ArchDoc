import { NextRequest } from "next/server";
import {
  jsonOk,
  notFound,
  serverError,
  validateApiKey,
  unauthorizedResponse,
} from "@/lib/api/helpers";
import { getScanRun } from "@/lib/db/queries";
import { enqueueDiagnoseJob, processJobById, getJob, startJobById } from "@/lib/jobs/diagnoseJob";
import { logDiagnoseSystemEvent } from "@/lib/jobs/diagnoseLogger";

/** When true, POST /diagnose blocks until LLM finishes (used in tests). Default: async enqueue. */
function shouldProcessInline(request: NextRequest): boolean {
  if (process.env.DIAGNOSE_INLINE === "true") return true;
  if (request.headers.get("X-Diagnose-Sync") === "true") return true;
  return false;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  const scan = await getScanRun(params.id);
  if (!scan) return notFound("Scan not found");

  try {
    const body = (await request.json().catch(() => ({}))) as {
      module_id?: string;
      module_name?: string;
      report_type?: "project" | "module";
    };
    const inline = shouldProcessInline(request);
    logDiagnoseSystemEvent("api_diagnose_request", {
      scan_id: params.id,
      inline,
      body,
    });

    const jobId = await enqueueDiagnoseJob(params.id, {
      report_type: body.report_type ?? "project",
      module_id: body.module_id,
      module_name: body.module_name,
    });

    let reportId: string | undefined;
    let jobError: string | undefined;

    if (
      shouldProcessInline(request) &&
      process.env.JOB_WORKER_ENABLED !== "false"
    ) {
      await processJobById(jobId, `inline-${Date.now()}`);
      const job = await getJob(jobId);
      reportId = (job?.result as { report_id?: string })?.report_id;
      if (job?.status === "failed") {
        jobError = job.error_message ?? "Diagnosis failed";
      }
    } else if (process.env.JOB_WORKER_ENABLED !== "false") {
      void startJobById(jobId, `enqueue-${Date.now()}`);
    }

    if (jobError) {
      logDiagnoseSystemEvent("api_diagnose_response", {
        job_id: jobId,
        report_id: reportId,
        error: jobError,
      });
      return serverError(jobError);
    }

    const message = reportId ? "Diagnosis completed" : "Diagnosis enqueued";
    logDiagnoseSystemEvent("api_diagnose_response", {
      job_id: jobId,
      report_id: reportId,
      message,
    });
    return jsonOk({ job_id: jobId, report_id: reportId, message }, 202);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to enqueue");
  }
}
