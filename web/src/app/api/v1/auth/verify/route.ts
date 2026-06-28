import { NextRequest } from "next/server";
import { jsonOk, unauthorizedResponse, validateApiKey } from "@/lib/api/helpers";

/** 验证 X-Api-Key 是否正确（供设置页测试） */
export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return unauthorizedResponse();
  }
  return jsonOk({ ok: true, message: "API 密钥有效" });
}
