import { NextRequest } from "next/server";
import {
  badRequest,
  jsonOk,
  parseJsonBody,
  validateApiKey,
  unauthorizedResponse,
} from "@/lib/api/helpers";
import { createDomain, listDomains } from "@/lib/db/queries";

export async function GET() {
  const domains = await listDomains();
  return jsonOk({ domains });
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();
  const body = await parseJsonBody<{ name?: string; description?: string }>(request);
  if (!body.name?.trim()) return badRequest("name is required");
  const domain = await createDomain(body.name.trim(), body.description);
  return jsonOk({ domain }, 201);
}
