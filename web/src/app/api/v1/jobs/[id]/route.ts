import { NextRequest } from "next/server";
import { jsonOk, notFound } from "@/lib/api/helpers";
import { getJob } from "@/lib/jobs/diagnoseJob";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const job = await getJob(params.id);
  if (!job) return notFound("Job not found");
  return jsonOk({ job });
}
