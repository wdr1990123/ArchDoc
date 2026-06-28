import { NextRequest } from "next/server";
import { jsonOk, notFound } from "@/lib/api/helpers";
import { getReport } from "@/lib/jobs/diagnoseJob";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const report = await getReport(params.id);
  if (!report) return notFound("Report not found");
  return jsonOk({ report });
}
