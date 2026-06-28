import { NextRequest } from "next/server";
import { jsonOk, notFound } from "@/lib/api/helpers";
import { getScanRun } from "@/lib/db/queries";
import { getGraphForScan } from "@/lib/metrics/scanMetrics";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const scan = await getScanRun(params.id);
  if (!scan) return notFound("Scan not found");
  const graph = await getGraphForScan(params.id);
  return jsonOk(graph);
}
