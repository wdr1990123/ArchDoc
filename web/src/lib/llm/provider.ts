import type { LlmProfile } from "./config";
import { getLlmProfileById } from "./config";
import { normalizeLlmError } from "./errors";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LlmExchangeEvent = {
  step: string;
  attempt: number;
  requestMessages: LlmMessage[];
  responseText: string;
  durationMs: number;
  httpStatus?: number;
  finishReason?: string;
  error?: string;
  maxTokens?: number;
};

export interface LlmChatOptions {
  json?: boolean;
  /** Override profile maxTokens for this request */
  maxTokens?: number;
  /** Diagnostic step id for logging */
  step?: string;
  attempt?: number;
  onExchange?: (event: LlmExchangeEvent) => void;
}

export interface LlmProvider {
  chat(messages: LlmMessage[], options?: LlmChatOptions): Promise<string>;
}

export function createProviderFromProfile(profile: LlmProfile): LlmProvider {
  if (!profile.apiKey) {
    return createMockProvider(profile.name);
  }

  return {
    async chat(messages: LlmMessage[], options?: LlmChatOptions) {
      const url = `${profile.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const maxTokens = options?.maxTokens ?? profile.maxTokens;
      const timeoutMs = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 600_000);
      const step = options?.step ?? "chat";
      const attempt = options?.attempt ?? 1;
      const startedAt = Date.now();

      const emitExchange = (partial: Partial<LlmExchangeEvent> & { responseText?: string }) => {
        options?.onExchange?.({
          step,
          attempt,
          requestMessages: messages,
          responseText: partial.responseText ?? "",
          durationMs: partial.durationMs ?? Date.now() - startedAt,
          httpStatus: partial.httpStatus,
          finishReason: partial.finishReason,
          error: partial.error,
          maxTokens,
        });
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
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
            max_tokens: maxTokens,
            temperature: 0.2,
            ...(options?.json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        });
      } catch (error) {
        const message = `${normalizeLlmError(error, timeoutMs)} (${profile.name}, ${url})`;
        emitExchange({ error: message, durationMs: Date.now() - startedAt });
        throw new Error(message);
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const text = await response.text();
        const bodyForLog = text.length <= 65536 ? text : text.slice(0, 2048);
        emitExchange({
          responseText: bodyForLog,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt,
          error: `HTTP ${response.status}`,
        });
        throw new Error(`请求失败 (${response.status}): ${text.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string }; finish_reason?: string }>;
      };
      const choice = data.choices[0];
      const content = choice?.message?.content ?? "";
      const finishReason = choice?.finish_reason;

      emitExchange({
        responseText: content,
        httpStatus: response.status,
        finishReason,
        durationMs: Date.now() - startedAt,
      });

      // Return partial JSON so diagnose job can compact-retry instead of failing immediately
      if (finishReason === "length" && !content.trim()) {
        throw new Error(
          `LLM 响应为空且因 max_tokens（${maxTokens}）被截断。请换用更快模型或稍后重试；系统会自动分批生成模块职责。`
        );
      }
      return content;
    },
  };
}

function createMockProvider(name: string): LlmProvider {
  return {
    async chat(messages, options) {
      const content = JSON.stringify({
        summary: `模拟诊断：模型「${name}」未配置 API Key，请在系统设置中完善配置后重新生成报告。`,
        risks: [],
        quick_wins: [],
        refactoring_recommendations: [],
      });
      options?.onExchange?.({
        step: options.step ?? "chat",
        attempt: options.attempt ?? 1,
        requestMessages: messages,
        responseText: content,
        durationMs: 0,
        finishReason: "stop",
        maxTokens: options.maxTokens,
      });
      return content;
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
