import { NextRequest } from "next/server";
import {
  jsonOk,
  notFound,
  serverError,
  validateApiKey,
  unauthorizedResponse,
} from "@/lib/api/helpers";
import { getScanRun } from "@/lib/db/queries";
import { enqueueDiagnoseJob, processJobById, getJob } from "@/lib/jobs/diagnoseJob";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  const scan = await getScanRun(params.id);
  if (!scan) return notFound("Scan not found");

  try {
    const jobId = await enqueueDiagnoseJob(params.id);
    let reportId: string | undefined;
    let jobError: string | undefined;
    if (process.env.JOB_WORKER_ENABLED !== "false") {
      await processJobById(jobId, `inline-${Date.now()}`);
      const job = await getJob(jobId);
      reportId = (job?.result as { report_id?: string })?.report_id;
      if (job?.status === "failed") {
        jobError = job.error_message ?? "Diagnosis failed";
      }
    }
    if (jobError) {
      return serverError(jobError);
    }
    return jsonOk({ job_id: jobId, report_id: reportId, message: "Diagnosis completed" }, 202);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to enqueue");
  }
}
