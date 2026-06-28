import { describe, expect, it } from "vitest";
import {
  buildIssueActionMap,
  linkDddToGovernanceActions,
  linkIssuesToGovernanceActions,
} from "@/lib/governance/governancePlan";
import { enrichDddFromModuleRollup, type ModuleIntentRollupEntry } from "@/lib/governance/moduleIntentRollup";
import type { AiReportContent } from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";

const structure: StructureFacts = {
  modules: [
    {
      id: "1",
      external_id: "a",
      name: "Order.Bll",
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
  layer_distribution: { bll: ["Order.Bll"] },
  key_dependency_chains: [],
  package_refs: [],
  total_loc: 100,
  total_modules: 1,
  issue_count: 0,
};

describe("linkDddToGovernanceActions", () => {
  it("creates action for recommended_split bounded context", () => {
    const content: AiReportContent = {
      summary: "s",
      risks: [],
      quick_wins: [],
      refactoring_recommendations: [],
      ddd_governance: {
        subdomain_landscape: [],
        bounded_contexts: [
          {
            name: "OrderContext",
            business_capability: "订单",
            modules: ["Order.Bll"],
            context_type: "recommended_split",
            boundary_rationale: "应拆分订单上下文",
            ubiquitous_language: ["Order"],
            confidence: "medium",
            evidence: [{ ref: "module:Order.Bll", label: "m", kind: "fact" }],
          },
          {
            name: "InfraContext",
            business_capability: "基础设施",
            modules: [],
            context_type: "existing",
            boundary_rationale: "r",
            ubiquitous_language: [],
            confidence: "low",
            evidence: [{ ref: "structure", label: "s", kind: "fact" }],
          },
        ],
        context_map: [],
        aggregates: [],
      },
      governance_plan: { phases: [], actions: [] },
    };

    const result = linkDddToGovernanceActions(content, structure, 70);
    expect(result.governance_plan?.actions.some((a) => a.title.includes("拆分"))).toBe(true);
    expect(result.ddd_governance?.bounded_contexts[0]?.linked_governance_actions?.length).toBeGreaterThan(0);
  });
});

describe("linkIssuesToGovernanceActions", () => {
  it("links issues to actions by evidence ref", () => {
    const content: AiReportContent = {
      summary: "s",
      risks: [],
      quick_wins: [],
      refactoring_recommendations: [],
      governance_plan: {
        phases: [],
        actions: [
          {
            id: "GA-001",
            title: "修复分层",
            category: "dependency",
            description: "d",
            rationale: "r",
            priority: "urgent",
            impact: "high",
            effort: "S",
            target_phase: "short",
            target_modules: ["Order.Bll"],
            prerequisites: [],
            acceptance_criteria: ["done"],
            evidence: [{ ref: "issue:abc-123", label: "i", kind: "fact" }],
          },
        ],
      },
    };

    const result = linkIssuesToGovernanceActions(content, [
      {
        id: "abc-123",
        rule_id: "layer.skip",
        severity: "high",
        message: "跨层",
        module_names: ["Order.Bll"],
      },
    ]);

    expect(result.governance_plan?.actions[0]?.linked_issues).toContain("issue:abc-123");
  });

  it("buildIssueActionMap reverses links", () => {
    const content: AiReportContent = {
      summary: "s",
      risks: [],
      quick_wins: [],
      refactoring_recommendations: [],
      governance_plan: {
        phases: [],
        actions: [
          {
            id: "GA-001",
            title: "A",
            category: "architecture",
            description: "d",
            rationale: "r",
            priority: "normal",
            impact: "low",
            effort: "S",
            target_phase: "short",
            target_modules: [],
            prerequisites: [],
            acceptance_criteria: ["x"],
            evidence: [],
            linked_issues: ["issue:x1"],
          },
        ],
      },
    };
    const map = buildIssueActionMap(content);
    expect(map.get("issue:x1")?.[0]?.id).toBe("GA-001");
  });
});

describe("enrichDddFromModuleRollup", () => {
  it("merges module rollup into bounded contexts and aggregates", () => {
    const rollup: ModuleIntentRollupEntry[] = [
      {
        module_name: "Order.Bll",
        purpose: "订单业务",
        business_capabilities: ["下单"],
        core_entities: ["Order", "Line"],
        bounded_context: "OrderContext",
        aggregate_candidates: [
          {
            type_name: "Order",
            role: "aggregate_root",
            ref: "type:Order.Bll:Order",
          },
        ],
        boundary_recommendations: [],
      },
    ];

    const content: AiReportContent = {
      summary: "s",
      risks: [],
      quick_wins: [],
      refactoring_recommendations: [],
      ddd_governance: {
        subdomain_landscape: [],
        bounded_contexts: [
          {
            name: "OrderContext",
            business_capability: "订单",
            modules: [],
            context_type: "existing",
            boundary_rationale: "r",
            ubiquitous_language: [],
            confidence: "medium",
            evidence: [],
          },
          {
            name: "OtherContext",
            business_capability: "其他",
            modules: ["X"],
            context_type: "existing",
            boundary_rationale: "r",
            ubiquitous_language: [],
            confidence: "low",
            evidence: [{ ref: "module:X", label: "X", kind: "fact" }],
          },
        ],
        context_map: [{ upstream_context: "A", downstream_context: "B", relationship: "customer_supplier", integration_modules: [], recommendation: "r", evidence: [{ ref: "structure", label: "s", kind: "fact" }] }],
        aggregates: [],
      },
    };

    const result = enrichDddFromModuleRollup(content, rollup);
    const bc = result.ddd_governance?.bounded_contexts.find((c) => c.name === "OrderContext");
    expect(bc?.modules).toContain("Order.Bll");
    expect(result.ddd_governance?.aggregates.some((a) => a.name === "Order")).toBe(true);
  });
});
