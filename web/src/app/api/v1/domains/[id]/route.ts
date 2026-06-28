import { NextRequest } from "next/server";
import { jsonOk, notFound } from "@/lib/api/helpers";
import {
  getDomain,
  listRepositoriesByDomain,
  listScanRunsByDomain,
} from "@/lib/db/queries";
import { listDomainSnapshots } from "@/lib/db/federation";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const domain = await getDomain(params.id);
  if (!domain) return notFound("Domain not found");

  const repositories = await listRepositoriesByDomain(params.id);
  const scanRuns = await listScanRunsByDomain(params.id);
  const snapshots = await listDomainSnapshots(params.id);

  return jsonOk({ domain, repositories, scanRuns, snapshots });
}
