import { describe, it, expect, vi } from "vitest";
import { GET as settingsGet, PUT as settingsPut } from "@/app/api/v1/settings/llm/route";
import { POST as settingsTestPost } from "@/app/api/v1/settings/llm/test/route";
import { testProfileConnection } from "@/lib/llm/provider";
import { apiRequest } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";

describe("GET /api/v1/settings/llm", () => {
  it("success: returns settings and envConfigured flag", async () => {
    const res = await settingsGet();
    const body = await expectJson<{
      settings: { profiles: unknown[]; defaultDiagnosisProfileId: string | null };
      envConfigured: boolean;
    }>(res, 200);

    expect(body.settings).toBeDefined();
    expect(Array.isArray(body.settings.profiles)).toBe(true);
    expect(typeof body.envConfigured).toBe("boolean");
  });
});

describe("PUT /api/v1/settings/llm", () => {
  it("success: updates LLM settings", async () => {
    const profileId = `test-profile-${Date.now()}`;
    const res = await settingsPut(
      apiRequest("PUT", "/api/v1/settings/llm", {
        body: {
          settings: {
            profiles: [
              {
                id: profileId,
                name: "Test Profile",
                provider: "openai",
                baseUrl: "https://api.example.com/v1",
                apiKey: "sk-test-key-12345678",
                model: "gpt-4o",
                maxTokens: 4096,
                enabled: true,
                role: "diagnosis",
                isDefault: true,
              },
            ],
            defaultDiagnosisProfileId: profileId,
          },
        },
      })
    );
    const body = await expectJson<{ settings: { profiles: { id: string }[] } }>(res, 200);
    expect(body.settings.profiles.some((p) => p.id === profileId)).toBe(true);
  });

  it("error: missing API key returns 401", async () => {
    const res = await settingsPut(
      apiRequest("PUT", "/api/v1/settings/llm", {
        apiKey: false,
        body: { settings: { profiles: [], defaultDiagnosisProfileId: null } },
      })
    );
    await expectError(res, 401);
  });
});

describe("POST /api/v1/settings/llm/test", () => {
  it("success: mock connection test returns ok", async () => {
    vi.mocked(testProfileConnection).mockResolvedValueOnce({
      ok: true,
      message: "mock ok",
      latencyMs: 2,
    });

    const res = await settingsTestPost(
      apiRequest("POST", "/api/v1/settings/llm/test", {
        body: {
          profile: {
            id: "inline-test",
            name: "Inline Test",
            provider: "openai",
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-inline-test-key",
            model: "gpt-4o",
            maxTokens: 4096,
            enabled: true,
            role: "diagnosis",
            isDefault: false,
          },
        },
      })
    );
    const body = await expectJson<{ ok: boolean }>(res, 200);
    expect(body.ok).toBe(true);
  });

  it("error: missing API key returns 401", async () => {
    const res = await settingsTestPost(
      apiRequest("POST", "/api/v1/settings/llm/test", {
        apiKey: false,
        body: { profileId: "any" },
      })
    );
    await expectError(res, 401);
  });

  it("error: missing profile returns 400", async () => {
    const res = await settingsTestPost(
      apiRequest("POST", "/api/v1/settings/llm/test", { body: {} })
    );
    await expectError(res, 400, "profile");
  });

  it("error: mock connection failure returns 503", async () => {
    vi.mocked(testProfileConnection).mockResolvedValueOnce({
      ok: false,
      message: "mock failure",
      latencyMs: 3,
    });

    const res = await settingsTestPost(
      apiRequest("POST", "/api/v1/settings/llm/test", {
        body: {
          profile: {
            id: "fail-test",
            name: "Fail Test",
            provider: "openai",
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-fail-key",
            model: "gpt-4o",
            maxTokens: 4096,
            enabled: true,
            role: "diagnosis",
            isDefault: false,
          },
        },
      })
    );
    const body = await expectJson<{ ok: boolean }>(res, 503);
    expect(body.ok).toBe(false);
  });
});
