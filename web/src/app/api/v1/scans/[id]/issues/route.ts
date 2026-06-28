import { NextRequest } from "next/server";
import { jsonOk, notFound } from "@/lib/api/helpers";
import { getScanRun } from "@/lib/db/queries";
import { getIssuesForScan, getModulesForScan } from "@/lib/metrics/scanMetrics";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const scan = await getScanRun(params.id);
  if (!scan) return notFound("Scan not found");

  const severity = request.nextUrl.searchParams.get("severity") ?? undefined;
  const issues = await getIssuesForScan(params.id, severity);
  const modules = await getModulesForScan(params.id);

  return jsonOk({ issues, modules });
}
