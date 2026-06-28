import { NextRequest } from "next/server";
import {
  badRequest,
  conflict,
  jsonOk,
  parseJsonBody,
  serverError,
  validateApiKey,
  unauthorizedResponse,
} from "@/lib/api/helpers";
import { quickStartDiagnosis } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      repo_name?: string;
      solution_path?: string;
    }>(request);

    if (!body.name?.trim()) return badRequest("name is required");
    if (!body.repo_name?.trim()) return badRequest("repo_name is required");
    if (!body.solution_path?.trim()) return badRequest("solution_path is required");

    const result = await quickStartDiagnosis({
      name: body.name.trim(),
      description: body.description?.trim(),
      repo_name: body.repo_name.trim(),
      solution_path: body.solution_path.trim(),
    });

    return jsonOk(result, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "DOMAIN_EXISTS") {
      return conflict("A domain with this name already exists");
    }
    return serverError(error instanceof Error ? error.message : "Quick start failed");
  }
}
