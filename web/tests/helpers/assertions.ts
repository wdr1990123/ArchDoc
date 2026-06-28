import { expect } from "vitest";

export async function expectStatus(response: Response, status: number) {
  expect(response.status).toBe(status);
  return response;
}

export async function expectJson<T = Record<string, unknown>>(
  response: Response,
  status: number
): Promise<T> {
  await expectStatus(response, status);
  return (await response.json()) as T;
}

export async function expectError(
  response: Response,
  status: number,
  messageContains?: string
) {
  const body = await expectJson<{ error?: string }>(response, status);
  if (messageContains) {
    expect(body.error?.toLowerCase()).toContain(messageContains.toLowerCase());
  }
  return body;
}
