import { describe, it, expect, vi } from "vitest";
import { GET as healthGet } from "@/app/api/v1/health/route";
import { GET as healthLlmGet } from "@/app/api/v1/health/llm/route";
import { PUT as settingsPut } from "@/app/api/v1/settings/llm/route";
import { testProfileConnection } from "@/lib/llm/provider";
import { apiRequest } from "../helpers/request";
import { expectJson } from "../helpers/assertions";

describe("GET /api/v1/health", () => {
  it("success: returns status and db connectivity", async () => {
    const res = await healthGet();
    const body = await expectJson<{
      status: string;
      db: boolean;
      timestamp: string;
    }>(res, 200);

    expect(["ok", "degraded"]).toContain(body.status);
    expect(typeof body.db).toBe("boolean");
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    if (body.db) {
      expect(body.status).toBe("ok");
    }
  });
});

describe("GET /api/v1/health/llm", () => {
  it("success: returns ok when mock profile connection succeeds", async () => {
    vi.mocked(testProfileConnection).mockResolvedValueOnce({
      ok: true,
      message: "mock ok",
      latencyMs: 1,
    });

    const res = await healthLlmGet(apiRequest("GET", "/api/v1/health/llm"));
    const body = await expectJson<{ ok: boolean; message: string }>(res, 200);
    expect(body.ok).toBe(true);
  });

  it("error: returns ok false when no usable profile", async () => {
    await settingsPut(
      apiRequest("PUT", "/api/v1/settings/llm", {
        body: { settings: { profiles: [], defaultDiagnosisProfileId: null } },
      })
    );

    const originalKey = process.env.LLM_API_KEY;
    process.env.LLM_API_KEY = "";

    const res = await healthLlmGet(
      apiRequest("GET", "/api/v1/health/llm", { searchParams: { profileId: "nonexistent-id" } })
    );
    const body = await expectJson<{ ok: boolean; message: string }>(res, 200);
    expect(body.ok).toBe(false);

    process.env.LLM_API_KEY = originalKey;
  });

  it("error: returns 503 when mock connection fails", async () => {
    process.env.LLM_API_KEY = "sk-test-key-for-health-check";

    vi.mocked(testProfileConnection).mockResolvedValueOnce({
      ok: false,
      message: "connection refused",
      latencyMs: 5,
    });

    const res = await healthLlmGet(apiRequest("GET", "/api/v1/health/llm"));
    const body = await expectJson<{ ok: boolean; message: string }>(res, 503);
    expect(body.ok).toBe(false);
  });
});
