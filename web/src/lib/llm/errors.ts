/** Map low-level fetch / network errors to actionable Chinese messages. */
export function normalizeLlmError(error: unknown, timeoutMs?: number): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (
    error instanceof Error &&
    (error.name === "AbortError" || lower.includes("abort"))
  ) {
    const secs = timeoutMs ? Math.round(timeoutMs / 1000) : 300;
    return `LLM 请求超时（${secs}s）。完整报告生成较慢，请稍后重试、换用更快模型，或在环境变量中提高 LLM_REQUEST_TIMEOUT_MS。`;
  }

  if (
    lower === "terminated" ||
    lower.includes("terminated") ||
    lower.includes("econnreset") ||
    lower.includes("socket hang up") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  ) {
    return (
      "LLM 连接被中断（terminated）。常见原因：请求耗时过长、输入过大或网关超时。" +
      "系统已自动拆分模块职责生成；请重试。若仍失败，请换用更快模型或检查 Base URL 与网络。"
    );
  }

  if (
    raw.includes("Expected ',' or ']' after array element") ||
    raw.includes("Expected ',' or '}' after property") ||
    raw.includes("Unexpected token") ||
    raw.includes("max_tokens 截断") ||
    raw.includes("JSON 不完整")
  ) {
    return (
      "LLM 返回的 JSON 不完整或格式错误（可能被 max_tokens 截断）。" +
      "系统已缩小分批并重试；请再次点击「AI 诊断」。若仍失败，请在设置中将「最大 Token」提高到 8192 或以上。"
    );
  }

  return raw;
}
