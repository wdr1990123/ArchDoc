import { NextRequest } from "next/server";
import { jsonOk, validateApiKey, unauthorizedResponse } from "@/lib/api/helpers";
import { pollAndProcessJobs } from "@/lib/jobs/diagnoseJob";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();
  const processed = await pollAndProcessJobs(`api-${Date.now()}`);
  return jsonOk({ processed });
}

export async function GET() {
  const processed = await pollAndProcessJobs(`cron-${Date.now()}`);
  return jsonOk({ processed });
}
