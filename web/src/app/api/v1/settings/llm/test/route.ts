import { NextRequest } from "next/server";
import {
  jsonOk,
  parseJsonBody,
  validateApiKey,
  unauthorizedResponse,
  badRequest,
} from "@/lib/api/helpers";
import {
  getLlmProfileById,
  mergeProfileUpdate,
  type LlmProfile,
} from "@/lib/llm/config";
import { testProfileConnection } from "@/lib/llm/provider";

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  const body = await parseJsonBody<{
    profileId?: string;
    profile?: Partial<LlmProfile>;
  }>(request);

  let profile: LlmProfile | null = null;

  if (body.profileId) {
    profile = await getLlmProfileById(body.profileId);
  } else if (body.profile) {
    const existing = body.profile.id
      ? await getLlmProfileById(body.profile.id)
      : null;
    profile = mergeProfileUpdate(existing ?? undefined, body.profile);
  }

  if (!profile) return badRequest("请指定 profileId 或 profile 配置");

  const result = await testProfileConnection(profile);
  return jsonOk(result, result.ok ? 200 : 503);
}
