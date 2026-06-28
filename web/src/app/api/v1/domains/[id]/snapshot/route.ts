import { NextRequest } from "next/server";
import {
  badRequest,
  jsonOk,
  parseJsonBody,
  serverError,
  validateApiKey,
  unauthorizedResponse,
  notFound,
} from "@/lib/api/helpers";
import { getDomain } from "@/lib/db/queries";
import { createDomainSnapshot, getFederationGraph } from "@/lib/db/federation";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  const domain = await getDomain(params.id);
  if (!domain) return notFound("Domain not found");

  const body = await parseJsonBody<{ name?: string; scan_run_ids?: string[] }>(request);
  if (!body.name?.trim()) return badRequest("name is required");
  if (!body.scan_run_ids?.length) return badRequest("scan_run_ids is required");

  try {
    const snapshot = await createDomainSnapshot(
      params.id,
      body.name.trim(),
      body.scan_run_ids
    );
    return jsonOk({ snapshot }, 201);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Snapshot failed");
  }
}

export async function GET(request: NextRequest) {
  const snapshotId = request.nextUrl.searchParams.get("snapshot_id");
  if (!snapshotId) {
    return badRequest("snapshot_id query param required for graph");
  }

  const graph = await getFederationGraph(snapshotId);
  if (!graph) return notFound("Snapshot not found");
  return jsonOk(graph);
}
