import { vi } from "vitest";
import type { LlmMessage } from "@/lib/llm/provider";

function buildMockModuleRole(name: string) {
  return {
    module_name: name,
    layer: "bll",
    responsibility_hypothesis: `Mock responsibility for ${name}.`,
    confidence: "low",
    key_types: [],
    evidence: [{ ref: `module:${name}`, label: name, kind: "fact" }],
    evidence_refs: [`module:${name}`],
  };
}

const mockInitialReport = {
  report_version: "2.0",
  summary: "Mock diagnosis report for automated tests.",
  module_roles: [] as ReturnType<typeof buildMockModuleRole>[],
  design_hypotheses: [
    {
      title: "Mock hypothesis",
      description: "Automated test placeholder.",
      confidence: "low",
      evidence: [],
      evidence_refs: [],
    },
  ],
  risks: [],
  quick_wins: [],
  refactoring_recommendations: [],
  strangler_candidates: [],
  strangler_roadmap: [],
};

function parseModuleNamesFromBatchPrompt(user: string): string[] {
  const marker = "为以下模块生成 module_roles";
  const idx = user.indexOf(marker);
  if (idx === -1) return [];
  const after = user.slice(idx);
  const arrMatch = after.match(/\n(\[[\s\S]*?\])\n\n模块事实/);
  if (!arrMatch) return [];
  try {
    const names = JSON.parse(arrMatch[1]) as unknown;
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

async function mockChat(messages: LlmMessage[]): Promise<string> {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages.find((m) => m.role === "user")?.content ?? "";

  if (system.includes("仅输出 module_roles")) {
    const names = parseModuleNamesFromBatchPrompt(user);
    return JSON.stringify({
      report_version: "2.0",
      module_roles: names.map(buildMockModuleRole),
    });
  }

  if (system.includes("架构报告修正器")) {
    return JSON.stringify(mockInitialReport);
  }

  return JSON.stringify(mockInitialReport);
}

vi.mock("@/lib/llm/provider", () => ({
  testProfileConnection: vi.fn().mockResolvedValue({
    ok: true,
    message: "mock ok",
    latencyMs: 1,
  }),
  createLlmProvider: vi.fn().mockResolvedValue({
    provider: {
      chat: vi.fn(mockChat),
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
