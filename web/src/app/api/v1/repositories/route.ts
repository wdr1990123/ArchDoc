import { NextRequest } from "next/server";
import {
  badRequest,
  jsonOk,
  parseJsonBody,
  validateApiKey,
  unauthorizedResponse,
} from "@/lib/api/helpers";
import { createRepository } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();
  const body = await parseJsonBody<{
    domain_id?: string;
    name?: string;
    source_type?: string;
    repo_url?: string;
    solution_path?: string;
  }>(request);

  if (!body.domain_id || !body.name?.trim()) {
    return badRequest("domain_id and name are required");
  }

  const repository = await createRepository({
    domain_id: body.domain_id,
    name: body.name.trim(),
    source_type: body.source_type,
    repo_url: body.repo_url,
    solution_path: body.solution_path,
  });

  return jsonOk({ repository }, 201);
}
