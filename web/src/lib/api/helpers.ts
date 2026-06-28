import { NextRequest, NextResponse } from "next/server";

export function validateApiKey(request: NextRequest): boolean {
  const expected = process.env.ARCHDOC_API_KEY;
  if (!expected) return true;
  const provided = request.headers.get("x-api-key");
  return provided === expected;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export async function parseJsonBody<T>(request: NextRequest): Promise<T> {
  return (await request.json()) as T;
}
