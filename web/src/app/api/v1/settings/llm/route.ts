import { NextRequest } from "next/server";
import {
  jsonOk,
  parseJsonBody,
  validateApiKey,
  unauthorizedResponse,
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

  const body = await parseJsonBody<{ settings: LlmSettings }>(request);
  const resolved = await resolveProfilesForSave(body.settings);
  await saveLlmSettings(resolved);

  return jsonOk({
    settings: {
      ...resolved,
      profiles: resolved.profiles.map(sanitizeProfileForClient),
    },
  });
}
