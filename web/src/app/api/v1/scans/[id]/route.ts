import { NextRequest } from "next/server";
import { jsonOk, notFound } from "@/lib/api/helpers";
import { getScanRun, getDomainForScanRun, getRepositoryForScanRun } from "@/lib/db/queries";
import { getScanOverview } from "@/lib/metrics/scanMetrics";
import { getReportsForScan } from "@/lib/jobs/diagnoseJob";
import { computeStranglerCandidates } from "@/lib/db/federation";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const scan = await getScanRun(params.id);
  if (!scan) return notFound("Scan not found");

  const overview = await getScanOverview(params.id);
  const repository = await getRepositoryForScanRun(params.id);
  const domain = await getDomainForScanRun(params.id);
  const reports = await getReportsForScan(params.id);
  const stranglerCandidates = await computeStranglerCandidates(params.id);

  return jsonOk({
    scan,
    overview,
    repository,
    domain,
    reports,
    stranglerCandidates,
  });
}
