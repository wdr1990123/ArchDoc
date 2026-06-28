import { describe, expect, it } from "vitest";
import {
  buildGovernancePlan,
  ensureDddGovernance,
  ensureExecutiveSummary,
  finalizeGovernanceContent,
  sanitizeGovernanceContent,
} from "@/lib/governance/governancePlan";
import { reportToMarkdown } from "@/lib/llm/prompts";
import type { AiReportContent } from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";

const structure: StructureFacts = {
  modules: [
    {
      id: "1",
      external_id: "a",
      name: "Mes.Bll",
      loc: 100,
      layer: "bll",
      ce: 2,
      ca: 3,
      instability: 0.4,
      issue_count: 1,
      top_types: [],
    },
    {
      id: "2",
      external_id: "b",
      name: "Mes.Dal",
      loc: 80,
      layer: "dal",
      ce: 0,
      ca: 1,
      instability: 0,
      issue_count: 0,
      top_types: [],
    },
  ],
  dependencies: [
    {
      from: "Mes.Bll",
      to: "Mes.Dal",
      ref: "dep:Mes.Bll->Mes.Dal",
      kind: "project_ref",
      from_layer: "bll",
      to_layer: "dal",
    },
  ],
  layer_distribution: { bll: ["Mes.Bll"], dal: ["Mes.Dal"] },
  key_dependency_chains: [],
  package_refs: [],
  total_loc: 180,
  total_modules: 2,
  issue_count: 1,
};

function baseContent(overrides: Partial<AiReportContent> = {}): AiReportContent {
  return {
    summary: "治理测试摘要",
    risks: [],
    quick_wins: [
      {
        title: "修复跨层依赖",
        description: "收敛 BLL 对 DAL 的直接引用",
        effort: "S",
        evidence: [{ ref: "dep:Mes.Bll->Mes.Dal", label: "dep", kind: "fact" }],
      },
    ],
    refactoring_recommendations: [],
    ...overrides,
  };
}

describe("buildGovernancePlan", () => {
  it("merges quick_wins into governance_plan.actions", () => {
    const result = buildGovernancePlan(baseContent(), structure, 72);
    expect(result.governance_plan?.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.governance_plan?.actions.some((a) => a.title === "修复跨层依赖")).toBe(true);
    expect(result.governance_plan?.actions[0]?.acceptance_criteria.length).toBeGreaterThan(0);
  });

  it("ensureDddGovernance creates bounded contexts from layers", () => {
    const result = ensureDddGovernance(baseContent(), structure);
    expect(result.ddd_governance?.bounded_contexts.length).toBeGreaterThanOrEqual(2);
    expect(result.ddd_governance?.context_map.length).toBeGreaterThanOrEqual(1);
  });

  it("ensureExecutiveSummary builds from governance plan", () => {
    const withPlan = buildGovernancePlan(baseContent(), structure, 72);
    const result = ensureExecutiveSummary(withPlan, 72, 1);
    expect(result.executive_summary?.governance_verdict).toBeDefined();
    expect(result.executive_summary?.top_actions.length).toBeGreaterThan(0);
  });

  it("finalizeGovernanceContent produces complete governance output", () => {
    const result = finalizeGovernanceContent(baseContent(), structure, 72, 1, true);
    expect(result.governance_plan?.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.ddd_governance?.bounded_contexts.length).toBeGreaterThanOrEqual(2);
    expect(result.report_version).toBe("2.1");
    expect(result.executive_summary).toBeDefined();
  });

  it("coerces string modules/design_concerns from LLM before join", () => {
    const raw = baseContent({
      ddd_governance: {
        subdomain_landscape: [],
        bounded_contexts: [
          {
            name: "WarehouseContext",
            business_capability: "仓储",
            modules: "iMES.Warehouse" as unknown as string[],
            context_type: "existing",
            boundary_rationale: "仓储模块边界",
            ubiquitous_language: [],
            confidence: "medium",
            evidence: [],
          },
          {
            name: "WebApiContext",
            business_capability: "API",
            modules: ["iMES.WebApi"],
            context_type: "existing",
            boundary_rationale: "API 边界",
            ubiquitous_language: [],
            confidence: "medium",
            evidence: [],
          },
        ],
        context_map: [],
        aggregates: [
          {
            name: "StockAgg",
            bounded_context: "WarehouseContext",
            aggregate_root: {
              type_name: "StockService",
              module_name: "iMES.Warehouse",
              ref: "type:iMES.Warehouse:StockService",
            },
            entities: [],
            invariants: [],
            consistency_boundary_note: "库存聚合",
            design_concerns: "职责过多" as unknown as string[],
            confidence: "medium",
            evidence: [],
          },
        ],
      },
    });

    const sanitized = sanitizeGovernanceContent(raw);
    expect(sanitized.ddd_governance?.bounded_contexts[0].modules).toEqual(["iMES.Warehouse"]);
    expect(sanitized.ddd_governance?.aggregates[0].design_concerns).toEqual(["职责过多"]);

    const result = finalizeGovernanceContent(raw, structure, 72, 1, true);
    const md = reportToMarkdown(result);
    expect(md).toContain("iMES.Warehouse");
    expect(md.length).toBeGreaterThan(100);
  });

  it("module report survives governance actions with missing titles", () => {
    const raw = baseContent({
      governance_plan: {
        phases: [{ phase: "short", title: "", objectives: [], success_metrics: [] }],
        actions: [
          {
            id: "GA-001",
            title: undefined as unknown as string,
            category: "boundary",
            description: "",
            rationale: "",
            priority: "important",
            impact: "medium",
            effort: "M",
            target_phase: "short",
            target_modules: ["Mes.Bll"],
            prerequisites: [],
            acceptance_criteria: ["边界收敛"],
            evidence: [],
          },
          {
            id: "GA-002",
            title: "模块边界治理",
            category: "boundary",
            description: "收敛模块对外依赖",
            rationale: "依赖过多",
            priority: "important",
            impact: "medium",
            effort: "M",
            target_phase: "short",
            target_modules: ["Mes.Bll"],
            prerequisites: [],
            acceptance_criteria: ["依赖违规减少"],
            evidence: [],
          },
        ],
      },
      strangler_roadmap: [
        {
          phase: 1,
          title: undefined as unknown as string,
          module_name: "Mes.Bll",
          prerequisites: [],
          rationale: "拆分",
        },
      ],
    });

    expect(() => finalizeGovernanceContent(raw, structure, 72, 1, false)).not.toThrow();
    const result = finalizeGovernanceContent(raw, structure, 72, 1, false);
    expect(result.governance_plan?.actions.some((a) => a.title === "模块边界治理")).toBe(true);
    expect(result.governance_plan?.actions.some((a) => a.title === "修复跨层依赖")).toBe(true);
  });
});
