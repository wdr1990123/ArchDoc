import { NextRequest } from "next/server";

export const TEST_API_KEY = process.env.ARCHDOC_API_KEY ?? "dev-secret-key";

export function apiRequest(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    apiKey?: string | false;
    searchParams?: Record<string, string>;
    headers?: Record<string, string>;
  }
): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  if (options?.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers();
  if (options?.apiKey !== false) {
    headers.set("x-api-key", options?.apiKey ?? TEST_API_KEY);
  }
  if (options?.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      headers.set(key, value);
    }
  }

  const init: RequestInit = { method, headers };
  if (options?.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  return new NextRequest(url, init);
}

export function routeContext(params: Record<string, string>) {
  return { params };
}

export const NON_EXISTENT_ID = "00000000-0000-0000-0000-000000000000";
