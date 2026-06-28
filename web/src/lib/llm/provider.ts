import type { LlmProfile } from "./config";
import { getLlmProfileById } from "./config";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  chat(messages: LlmMessage[], options?: { json?: boolean }): Promise<string>;
}

export function createProviderFromProfile(profile: LlmProfile): LlmProvider {
  if (!profile.apiKey) {
    return createMockProvider(profile.name);
  }

  return {
    async chat(messages: LlmMessage[], options?: { json?: boolean }) {
      const url = `${profile.baseUrl.replace(/\/$/, "")}/chat/completions`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${profile.apiKey}`,
          },
          body: JSON.stringify({
            model: profile.model,
            messages,
            max_tokens: profile.maxTokens,
            temperature: 0.2,
            ...(options?.json ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "未知错误";
        throw new Error(
          `无法连接 LLM 服务 (${profile.name}, ${url}): ${detail}。请检查 Base URL、网络与 API Key。`
        );
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`请求失败 (${response.status}): ${text.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content ?? "";
    },
  };
}

function createMockProvider(name: string): LlmProvider {
  return {
    async chat() {
      return JSON.stringify({
        summary: `模拟诊断：模型「${name}」未配置 API Key，请在系统设置中完善配置后重新生成报告。`,
        risks: [],
        quick_wins: [],
        refactoring_recommendations: [],
      });
    },
  };
}

export async function createLlmProvider(profileId?: string): Promise<{
  provider: LlmProvider;
  profile: LlmProfile | null;
}> {
  const profile = await getLlmProfileById(profileId);
  if (!profile) {
    return { provider: createMockProvider("未配置"), profile: null };
  }
  return { provider: createProviderFromProfile(profile), profile };
}

export async function testProfileConnection(
  profile: LlmProfile
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  if (!profile.apiKey) {
    return { ok: false, message: "API Key 未填写" };
  }

  const start = Date.now();
  try {
    const provider = createProviderFromProfile(profile);
    const reply = await provider.chat(
      [{ role: "user", content: '请回复 JSON：{"status":"ok"}' }],
      { json: true }
    );
    return {
      ok: true,
      message: reply.slice(0, 120),
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "未知错误",
      latencyMs: Date.now() - start,
    };
  }
}
