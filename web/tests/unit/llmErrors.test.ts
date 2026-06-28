import { describe, expect, it } from "vitest";
import { normalizeLlmError } from "@/lib/llm/errors";
import { buildDiagnosisPrompt } from "@/lib/llm/prompts";
import type { StructureFacts } from "@/lib/metrics/structureFacts";

describe("normalizeLlmError", () => {
  it("maps terminated to actionable message", () => {
    const msg = normalizeLlmError(new Error("terminated"));
    expect(msg).toContain("连接被中断");
    expect(msg).not.toBe("terminated");
  });

  it("maps malformed JSON to actionable message", () => {
    const msg = normalizeLlmError(
      new Error("Expected ',' or ']' after array element in JSON at position 8492")
    );
    expect(msg).toContain("JSON 不完整");
    expect(msg).toContain("8192");
  });
});

describe("buildDiagnosisPrompt defer module_roles", () => {
  const structure: StructureFacts = {
    modules: [
      {
        id: "1",
        external_id: "a",
        name: "Test.Bll",
        loc: 100,
        layer: "bll",
        ce: 1,
        ca: 2,
        instability: 0.5,
        issue_count: 0,
        top_types: [],
      },
    ],
    dependencies: [],
    layer_distribution: { bll: ["Test.Bll"] },
    key_dependency_chains: [],
    package_refs: [],
    total_loc: 100,
    total_modules: 1,
    issue_count: 0,
  };

  it("defers module_roles for all project reports", () => {
    const { system, user } = buildDiagnosisPrompt({
      reportType: "project",
      projectName: "Test",
      solutionPath: "Test.sln",
      healthScore: 80,
      issueCounts: {},
      structure,
      issues: [],
      metrics: [],
      summaries: [],
    });

    expect(system).toContain("module_roles: []");
    expect(user).toContain("分批生成");
    expect(user).not.toContain("issue_interpretations");
  });
});
