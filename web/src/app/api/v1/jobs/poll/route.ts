import { NextRequest } from "next/server";
import { jsonOk, validateApiKey, unauthorizedResponse } from "@/lib/api/helpers";
import { pollAndProcessJobs, processJobById, startJobById } from "@/lib/jobs/diagnoseJob";

/** Diagnosis may run multiple LLM calls; allow long-running poll on supported hosts */
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();
  const body = (await request.json().catch(() => ({}))) as {
    job_id?: string;
    /** When true, block until LLM finishes (tests). Default: fire-and-forget kick */
    sync?: boolean;
  };

  if (body.job_id) {
    const workerId = `api-${Date.now()}`;
    if (body.sync || request.headers.get("X-Job-Sync") === "true") {
      const processed = (await processJobById(body.job_id, workerId)) ? 1 : 0;
      return jsonOk({ processed });
    }
    const kick = await startJobById(body.job_id, workerId);
    return jsonOk({
      processed: kick === "started" ? 1 : 0,
      kick,
    });
  }

  const processed = await pollAndProcessJobs(`api-${Date.now()}`);
  return jsonOk({ processed });
}

export async function GET() {
  const processed = await pollAndProcessJobs(`cron-${Date.now()}`);
  return jsonOk({ processed });
}
