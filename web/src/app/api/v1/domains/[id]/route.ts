import { NextRequest } from "next/server";
import { jsonOk, notFound, unauthorizedResponse, validateApiKey } from "@/lib/api/helpers";
import {
  deleteDomain,
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorizedResponse();
  const deleted = await deleteDomain(params.id);
  if (!deleted) return notFound("Domain not found");
  return jsonOk({ ok: true });
}
