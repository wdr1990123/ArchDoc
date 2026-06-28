import { NextRequest } from "next/server";
import {
  badRequest,
  jsonOk,
  parseJsonBody,
  serverError,
  validateApiKey,
  unauthorizedResponse,
} from "@/lib/api/helpers";
import { ingestScanResult } from "@/lib/db/queries";
import type { ScanResultPayload } from "@/lib/types";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const payload = await parseJsonBody<ScanResultPayload>(request);
    if (!payload.repository_id) return badRequest("repository_id is required");
    if (!payload.modules?.length) return badRequest("modules array is required");

    const result = await ingestScanResult(payload);
    return jsonOk(result, 201);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Upload failed");
  }
}
