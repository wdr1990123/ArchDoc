import { NextRequest } from "next/server";
import { jsonOk, notFound } from "@/lib/api/helpers";
import { getRepository, listScanRunsByRepository } from "@/lib/db/queries";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!UUID_RE.test(params.id)) return notFound("Repository not found");

  const repo = await getRepository(params.id);
  if (!repo) return notFound("Repository not found");

  const since = request.nextUrl.searchParams.get("since");
  const runs = await listScanRunsByRepository(params.id);
  const latest = runs.find((r) => r.status === "completed") ?? runs[0];

  if (!latest) {
    return jsonOk({ scan: null });
  }

  if (since) {
    const sinceMs = new Date(since).getTime();
    const latestMs = new Date(latest.created_at).getTime();
    if (!Number.isNaN(sinceMs) && latestMs <= sinceMs) {
      return jsonOk({ scan: null });
    }
  }

  return jsonOk({
    scan: {
      id: latest.id,
      status: latest.status,
      solution_path: latest.solution_path,
      created_at: latest.created_at,
    },
  });
}
