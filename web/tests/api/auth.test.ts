import { describe, it, expect } from "vitest";
import { GET as verifyGet } from "@/app/api/v1/auth/verify/route";
import { apiRequest } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";

describe("GET /api/v1/auth/verify", () => {
  it("success: valid API key returns ok", async () => {
    const res = await verifyGet(apiRequest("GET", "/api/v1/auth/verify"));
    const body = await expectJson<{ ok: boolean; message: string }>(res, 200);
    expect(body.ok).toBe(true);
  });

  it("error: missing API key returns 401", async () => {
    const res = await verifyGet(
      apiRequest("GET", "/api/v1/auth/verify", { apiKey: false })
    );
    await expectError(res, 401);
  });

  it("error: invalid API key returns 401", async () => {
    const res = await verifyGet(
      apiRequest("GET", "/api/v1/auth/verify", { apiKey: "wrong-key" })
    );
    await expectError(res, 401);
  });
});
