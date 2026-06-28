import { vi } from "vitest";

const mockReportJson = JSON.stringify({
  summary: "Mock diagnosis report for automated tests.",
  risks: [],
  quick_wins: [],
  refactoring_recommendations: [],
});

vi.mock("@/lib/llm/provider", () => ({
  testProfileConnection: vi.fn().mockResolvedValue({
    ok: true,
    message: "mock ok",
    latencyMs: 1,
  }),
  createLlmProvider: vi.fn().mockResolvedValue({
    provider: {
      chat: vi.fn().mockResolvedValue(mockReportJson),
    },
    profile: {
      id: "mock-profile",
      name: "Mock Profile",
      provider: "openai",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-mock-key",
      model: "gpt-4o",
      maxTokens: 4096,
      enabled: true,
      role: "diagnosis",
      isDefault: true,
    },
  }),
  createProviderFromProfile: vi.fn(),
}));
