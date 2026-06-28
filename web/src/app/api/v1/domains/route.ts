import { NextRequest } from "next/server";
import {
  badRequest,
  conflict,
  jsonOk,
  parseJsonBody,
  validateApiKey,
  unauthorizedResponse,
} from "@/lib/api/helpers";
import { createDomain, findDomainByName, listDomains } from "@/lib/db/queries";

export async function GET() {
  const domains = await listDomains();
  return jsonOk({ domains });
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();
  const body = await parseJsonBody<{ name?: string; description?: string }>(request);
  if (!body.name?.trim()) return badRequest("name is required");
  const trimmedName = body.name.trim();
  const existing = await findDomainByName(trimmedName);
  if (existing) return conflict("A domain with this name already exists");
  const domain = await createDomain(trimmedName, body.description);
  return jsonOk({ domain }, 201);
}
