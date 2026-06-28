import { NextRequest } from "next/server";
import {
  jsonOk,
  parseJsonBody,
  validateApiKey,
  unauthorizedResponse,
  badRequest,
} from "@/lib/api/helpers";
import {
  getLlmSettings,
  resolveProfilesForSave,
  sanitizeProfileForClient,
  saveLlmSettings,
  type LlmSettings,
} from "@/lib/llm/config";

export async function GET() {
  const settings = await getLlmSettings();
  return jsonOk({
    settings: {
      ...settings,
      profiles: settings.profiles.map(sanitizeProfileForClient),
    },
    envConfigured: Boolean(process.env.LLM_API_KEY),
  });
}

export async function PUT(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse();

  try {
    const body = await parseJsonBody<{ settings?: LlmSettings } & LlmSettings>(request);
    const incoming = body.settings ?? body;
    if (!incoming?.profiles || !Array.isArray(incoming.profiles)) {
      return badRequest("请提供 settings.profiles 配置");
    }

    const resolved = await resolveProfilesForSave(incoming);
    await saveLlmSettings(resolved);

    return jsonOk({
      settings: {
        ...resolved,
        profiles: resolved.profiles.map(sanitizeProfileForClient),
      },
    });
  } catch (e) {
    console.error("PUT /settings/llm failed:", e);
    throw e;
  }
}
