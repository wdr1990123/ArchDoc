import { resolveApiKey } from "./storage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

function authHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = resolveApiKey(apiKey);
  if (key) headers["X-Api-Key"] = key;
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401) {
      throw new Error(
        err.error === "Unauthorized"
          ? "未授权：请在「系统设置」中配置 API 访问密钥（默认 dev-secret-key）"
          : (err.error ?? "未授权")
      );
    }
    throw new Error(err.error ?? `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  apiKey?: string
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  apiKey?: string
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}
