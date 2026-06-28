import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/api/helpers";
import { getLlmProfileById } from "@/lib/llm/config";
import { testProfileConnection } from "@/lib/llm/provider";

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get("profileId") ?? undefined;
  const profile = await getLlmProfileById(profileId);

  if (!profile?.apiKey) {
    return jsonOk({
      ok: false,
      message: "未配置可用的诊断模型，请前往系统设置添加",
      profileName: profile?.name ?? null,
    });
  }

  const result = await testProfileConnection(profile);
  return jsonOk({
    ...result,
    profileName: profile.name,
    model: profile.model,
  }, result.ok ? 200 : 503);
}
