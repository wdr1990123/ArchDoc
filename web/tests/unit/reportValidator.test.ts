import { describe, expect, it } from "vitest";
import {
  enrichReportContent,
  getMissingModuleNames,
  mergeModuleRoles,
} from "@/lib/llm/prompts";
import { finalizeGovernanceContent } from "@/lib/governance/governancePlan";
import { validateReport, syncEvidenceRefs, coerceToString, sanitizeModuleRoles, isParseTruncationError, extractModuleRolesFromLlmJson, normalizeEffort, sanitizeRefactoringRecommendations, normalizeEvidenceRef, ensureDesignHypotheses, normalizeReportEvidenceRefs } from "@/lib/validation/reportValidator";
import type { AiReportContent } from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";

function baseContent(overrides: Partial<AiReportContent> = {}): AiReportContent {
  return {
    summary: "测试摘要",
    risks: [],
    quick_wins: [],
    refactoring_recommendations: [],
    ...overrides,
  };
}

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
    {
      id: "2",
      external_id: "b",
      name: "Test.Dal",
      loc: 80,
      layer: "dal",
      ce: 0,
      ca: 1,
      instability: 0,
      issue_count: 0,
      top_types: [],
    },
  ],
  dependencies: [],
  layer_distribution: { bll: ["Test.Bll"], dal: ["Test.Dal"] },
  key_dependency_chains: [
    { path: ["Test.Bll", "Test.Dal"], reason: "layer_skip", ref: "dep:Test.Bll->Test.Dal" },
  ],
  package_refs: [],
  total_loc: 180,
  total_modules: 2,
  issue_count: 0,
};

describe("validateReport module_intent", () => {
  const evidenceIndex = new Map<string, boolean>([
    ["module:Test.Bll", true],
    ["type:Test.Bll:OrderService", true],
  ]);

  it("requires module_intent for module reports", () => {
    const result = validateReport(baseContent(), evidenceIndex, 0, {
      moduleReport: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("module report missing module_intent");
  });

  it("validates complete module_intent", () => {
    const content = baseContent({
      module_intent: {
        module_name: "Test.Bll",
        purpose: "负责订单业务逻辑处理",
        business_capabilities: ["订单创建", "订单查询"],
        core_entities: ["Order", "OrderLine"],
        key_workflows: [
          {
            name: "创建订单",
            description: "接收 UI 请求并持久化订单",
            evidence: [
              {
                ref: "module:Test.Bll",
                label: "Test.Bll",
                kind: "inference",
                confidence: "medium",
              },
            ],
          },
        ],
        external_interfaces: [
          {
            name: "OrderService",
            kind: "service",
            summary: "订单服务入口",
            evidence: [
              {
                ref: "type:Test.Bll:OrderService",
                label: "OrderService",
                kind: "fact",
              },
            ],
          },
        ],
        upstream_modules: ["Test.Dal"],
        downstream_modules: ["Test.Web"],
        confidence: "medium",
        evidence: [{ ref: "module:Test.Bll", label: "Test.Bll", kind: "fact" }],
      },
    });

    const result = validateReport(content, evidenceIndex, 0, {
      moduleReport: true,
      publicTypeNames: new Set(["OrderService"]),
    });
    expect(result.valid).toBe(true);
  });

  it("rejects unknown external interface types when public_surface known", () => {
    const content = baseContent({
      module_intent: {
        module_name: "Test.Bll",
        purpose: "测试",
        business_capabilities: ["A", "B"],
        core_entities: ["X", "Y"],
        key_workflows: [
          {
            name: "flow",
            description: "desc",
            evidence: [{ ref: "module:Test.Bll", label: "x", kind: "fact" }],
          },
        ],
        external_interfaces: [
          {
            name: "FakeService",
            kind: "service",
            summary: "不存在",
            evidence: [{ ref: "type:Test.Bll:FakeService", label: "x", kind: "fact" }],
          },
        ],
        upstream_modules: [],
        downstream_modules: [],
        confidence: "low",
        evidence: [],
      },
    });

    const result = validateReport(content, evidenceIndex, 0, {
      publicTypeNames: new Set(["OrderService"]),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("FakeService"))).toBe(true);
  });
});

describe("validateReport project completeness", () => {
  const evidenceIndex = new Map<string, boolean>([
    ["module:Test.Bll", true],
    ["module:Test.Dal", true],
    ["dep:Test.Bll->Test.Dal", true],
    ["structure", true],
  ]);

  function projectContent(): AiReportContent {
    const enriched = enrichReportContent(
      {
        summary: "项目摘要",
        module_roles: structure.modules.map((m) => ({
          module_name: m.name,
          layer: m.layer,
          responsibility_hypothesis: `${m.name} 职责`,
          confidence: "medium" as const,
          key_types: [],
          evidence: [
            {
              ref: `module:${m.name}`,
              label: m.name,
              kind: "inference" as const,
              confidence: "medium" as const,
            },
          ],
        })),
        design_hypotheses: [
          {
            title: "分层",
            description: "经典三层",
            confidence: "medium",
            based_on_refs: ["module:Test.Bll"],
          },
        ],
        risks: [],
        quick_wins: [
          {
            title: "收敛依赖",
            description: "修复跨层引用",
            effort: "S",
            evidence: [{ ref: "dep:Test.Bll->Test.Dal", label: "dep", kind: "fact" }],
          },
        ],
        refactoring_recommendations: [
          {
            title: "模块边界梳理",
            description: "明确 BLL 边界",
            category: "boundary",
            effort: "M",
            module_name: "Test.Bll",
            evidence: [{ ref: "module:Test.Bll", label: "Test.Bll", kind: "fact" }],
          },
          {
            title: "DAL 接口隔离",
            description: "引入仓储接口",
            category: "ddd_integration",
            effort: "M",
            module_name: "Test.Dal",
            evidence: [{ ref: "module:Test.Dal", label: "Test.Dal", kind: "fact" }],
          },
        ],
        strangler_candidates: [],
        strangler_roadmap: [],
      },
      structure,
      75,
      []
    );
    return finalizeGovernanceContent(enriched, structure, 75, 0, true);
  }

  it("accepts complete project report", () => {
    const content = projectContent();
    const result = validateReport(content, evidenceIndex, 0, { structure });
    expect(result.valid).toBe(true);
  });

  it("rejects missing module_roles", () => {
    const content = projectContent();
    content.module_roles = content.module_roles!.slice(0, 1);
    const result = validateReport(content, evidenceIndex, 0, { structure });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("module_roles"))).toBe(true);
  });

  it("requires design_hypotheses", () => {
    const content = projectContent();
    content.design_hypotheses = [];
    const result = validateReport(content, evidenceIndex, 0, { structure });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("design_hypotheses must have at least 1 entry");
  });

  it("accepts non-string responsibility_hypothesis after normalization", () => {
    const content = projectContent();
    content.module_roles = content.module_roles!.map((role, i) =>
      i === 0
        ? {
            ...role,
            responsibility_hypothesis: ["推断", "职责描述"] as unknown as string,
          }
        : role
    );
    const normalized = syncEvidenceRefs(content);
    expect(() =>
      validateReport(normalized, evidenceIndex, 0, { structure })
    ).not.toThrow();
    expect(coerceToString(normalized.module_roles![0].responsibility_hypothesis)).toBe(
      "推断 职责描述"
    );
  });

  it("sanitizeModuleRoles drops blank and unknown module names", () => {
    const content = projectContent();
    const roles = [
      ...content.module_roles!,
      {
        module_name: "",
        layer: "unknown",
        responsibility_hypothesis: "无效",
        confidence: "low" as const,
        key_types: [],
        evidence: [],
      },
      {
        module_name: "Not.In.Scan",
        layer: "unknown",
        responsibility_hypothesis: "无效",
        confidence: "low" as const,
        key_types: [],
        evidence: [],
      },
    ];
    const cleaned = sanitizeModuleRoles(roles, structure);
    expect(cleaned).toHaveLength(structure.total_modules);
    expect(cleaned.every((r) => r.module_name.trim().length > 0)).toBe(true);
    const result = validateReport(
      { ...content, module_roles: cleaned },
      evidenceIndex,
      0,
      { structure }
    );
    expect(result.valid).toBe(true);
  });
});

describe("isParseTruncationError", () => {
  it("detects truncated array JSON from LLM", () => {
    expect(
      isParseTruncationError(
        new Error("Expected ',' or ']' after array element in JSON at position 8492")
      )
    ).toBe(true);
  });
});

describe("enrichReportContent", () => {
  it("injects facts and issue interpretations", () => {
    const enriched = enrichReportContent(baseContent(), structure, 80, [
      {
        id: "iss-1",
        rule_id: "LAYER_VIOLATION",
        severity: "high",
        message: "分层违规",
        module_names: ["Test.Bll"],
      },
    ]);

    expect(enriched.architecture_overview?.module_count).toBe(2);
    expect(enriched.key_dependency_chains?.length).toBe(1);
    expect(enriched.issue_interpretations?.length).toBe(1);
    expect(enriched.issue_interpretations?.[0].issue_ref).toBe("issue:iss-1");
  });
});

describe("mergeModuleRoles", () => {
  it("merges batch roles by module name", () => {
    const content = baseContent({
      module_roles: [
        {
          module_name: "Test.Bll",
          layer: "bll",
          responsibility_hypothesis: "旧",
          confidence: "low",
          key_types: [],
          evidence: [],
        },
      ],
    });
    const merged = mergeModuleRoles(content, [
      {
        module_name: "Test.Dal",
        layer: "dal",
        responsibility_hypothesis: "新",
        confidence: "medium",
        key_types: [],
        evidence: [],
      },
    ]);
    expect(merged.module_roles?.length).toBe(2);
    expect(getMissingModuleNames(merged, structure)).toEqual([]);
  });
});

describe("normalizeEffort", () => {
  it("defaults null to M", () => {
    expect(normalizeEffort(null)).toBe("M");
    expect(normalizeEffort(undefined)).toBe("M");
  });

  it("accepts S M L case-insensitively", () => {
    expect(normalizeEffort("s")).toBe("S");
    expect(normalizeEffort("L")).toBe("L");
  });
});

describe("sanitizeRefactoringRecommendations", () => {
  it("fills effort and drops blank rows", () => {
    const out = sanitizeRefactoringRecommendations([
      { title: "拆分 Core", category: "modularity", description: "desc", effort: null as unknown as "S" },
      { title: "", category: "x", description: "y", effort: "S" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].effort).toBe("M");
  });
});

describe("normalizeEvidenceRef", () => {
  it("keeps structure ref and prefixes bare module names", () => {
    expect(normalizeEvidenceRef("structure")).toBe("structure");
    expect(normalizeEvidenceRef("Test.Bll", structure)).toBe("module:Test.Bll");
  });

  it("maps invented architecture and layer refs to structure", () => {
    expect(normalizeEvidenceRef("architecture:layer_analysis")).toBe("structure");
    expect(normalizeEvidenceRef("layer:unknown")).toBe("structure");
    expect(normalizeEvidenceRef("layer_analysis")).toBe("structure");
  });

  it("prefixes shorthand type refs with module name", () => {
    expect(
      normalizeEvidenceRef("type:Ware_OutWareHouseBillService", structure, "iMES.Warehouse")
    ).toBe("type:iMES.Warehouse:Ware_OutWareHouseBillService");
    expect(
      normalizeEvidenceRef("type:iMES.WebApi:Sys_UserController", structure, "iMES.WebApi")
    ).toBe("type:iMES.WebApi:Sys_UserController");
  });
});

describe("ensureDesignHypotheses", () => {
  it("fills missing design_hypotheses from structure facts", () => {
    const out = ensureDesignHypotheses(baseContent(), structure);
    expect(out.design_hypotheses).toHaveLength(1);
    expect(out.design_hypotheses![0].based_on_refs).toContain("structure");
  });

  it("passes validation when LLM omits design_hypotheses", () => {
    const evidenceIndex = new Map<string, boolean>([
      ["structure", true],
      ["module:Test.Bll", true],
      ["module:Test.Dal", true],
    ]);
    const enriched = ensureDesignHypotheses(
      normalizeReportEvidenceRefs(
        baseContent({
          risks: [
            {
              title: "分层架构缺失",
              severity: "medium",
              description: "unknown 层过多",
              evidence: [
                { ref: "architecture:layer_analysis", label: "分层", kind: "fact" },
              ],
            },
          ],
        }),
        structure
      ),
      structure
    );
    const result = validateReport(enriched, evidenceIndex, 0, { structure });
    expect(result.errors).not.toContain("design_hypotheses must have at least 1 entry");
    expect(result.errors.filter((e) => e.includes("architecture"))).toEqual([]);
  });
});

describe("validateReport module_role type evidence", () => {
  it("accepts shorthand type refs after normalization", () => {
    const index = new Map<string, boolean>([
      ["module:Test.Bll", true],
      ["type:Test.Bll:OrderService", true],
    ]);
    const normalized = normalizeReportEvidenceRefs(
      baseContent({
        module_roles: [
          {
            module_name: "Test.Bll",
            layer: "bll",
            responsibility_hypothesis: "订单业务",
            confidence: "medium",
            key_types: ["OrderService"],
            evidence: [
              {
                ref: "type:OrderService",
                label: "OrderService",
                kind: "fact",
              },
            ],
          },
        ],
      }),
      structure
    );
    const result = validateReport(normalized, index, 0, { structure });
    expect(
      result.errors.filter((e) => e.includes("OrderService") || e.includes("Test.Bll"))
    ).toEqual([]);
  });
});

describe("validateReport structure evidence", () => {
  it("accepts structure ref when index includes it", () => {
    const index = new Map<string, boolean>([["structure", true]]);
    const result = validateReport(
      baseContent({
        risks: [
          {
            title: "分层缺失",
            severity: "medium",
            description: "unknown 层过多",
            evidence: [{ ref: "structure", label: "结构", kind: "fact" }],
          },
        ],
      }),
      index,
      structure.issue_count,
      { structure }
    );
    expect(result.errors.filter((e) => e.includes("structure"))).toEqual([]);
  });
});

describe("extractModuleRolesFromLlmJson", () => {
  it("maps module alias to module_name", () => {
    const roles = extractModuleRolesFromLlmJson({
      module_roles: [
        {
          module: "iMES.Core",
          responsibility_hypothesis: "核心库",
          confidence: "high",
          key_types: [],
          evidence: [],
        },
      ],
    } as unknown as AiReportContent);
    expect(roles).toHaveLength(1);
    expect(roles[0].module_name).toBe("iMES.Core");
  });
});
