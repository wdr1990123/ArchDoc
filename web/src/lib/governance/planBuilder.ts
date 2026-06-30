import type {
  AiReportContent,
  DddGovernance,
  EvidenceItem,
  ExecutiveSummary,
  GovernanceAction,
  GovernancePlan,
} from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";
import {
  normalizeEffort,
  coerceToString,
  coerceToStringArray,
} from "@/lib/validation/reportValidator";
import { nextActionId } from "@/lib/governance/planUtils";

function evidenceFromLegacy(
  evidence?: EvidenceItem[],
  legacy?: string[]
): EvidenceItem[] {
  if (evidence?.length) return evidence;
  return (legacy ?? []).map((ref) => ({
    ref,
    label: ref,
    kind: "fact" as const,
  }));
}

function inferCategory(
  source: "quick_win" | "refactoring" | "strangler",
  category?: string
): GovernanceAction["category"] {
  if (source === "strangler") return "ddd_context";
  const c = (category ?? "").toLowerCase();
  if (c.includes("ddd") || c.includes("domain") || c.includes("context")) return "ddd_context";
  if (c.includes("aggregate")) return "ddd_aggregate";
  if (c.includes("boundary") || c.includes("边界")) return "boundary";
  if (c.includes("depend") || c.includes("依赖")) return "dependency";
  if (c.includes("debt") || c.includes("债")) return "technical_debt";
  if (source === "quick_win") return "application";
  return "architecture";
}

function inferPhase(source: "quick_win" | "refactoring" | "strangler", phase?: number): GovernanceAction["target_phase"] {
  if (source === "quick_win") return "short";
  if (source === "strangler") {
    if (!phase || phase <= 2) return "short";
    if (phase <= 4) return "mid";
    return "long";
  }
  return "mid";
}

function inferPriority(source: "quick_win" | "refactoring" | "strangler"): GovernanceAction["priority"] {
  if (source === "quick_win") return "important";
  if (source === "strangler") return "important";
  return "normal";
}

/** Merge LLM governance actions with quick_wins / refactoring / strangler into unified plan */
export function buildGovernancePlan(
  content: AiReportContent,
  structure: StructureFacts,
  healthScore: number
): AiReportContent {
  const existing = content.governance_plan?.actions ?? [];
  const byTitle = new Map<string, GovernanceAction>();
  for (const action of existing) {
    const title = coerceToString(action.title).trim();
    if (title) byTitle.set(title, { ...action, title });
  }

  let seq = existing.length + 1;
  const addAction = (partial: Omit<GovernanceAction, "id"> & { id?: string }) => {
    const title = coerceToString(partial.title).trim();
    if (!title || byTitle.has(title)) return;
    const action: GovernanceAction = {
      ...partial,
      id: partial.id ?? nextActionId(seq++),
      acceptance_criteria:
        partial.acceptance_criteria?.length > 0
          ? partial.acceptance_criteria
          : [`完成「${title}」且复扫健康分不低于 ${Math.max(0, healthScore - 5)}`],
    };
    byTitle.set(title, action);
  };

  for (const q of content.quick_wins ?? []) {
    addAction({
      title: q.title,
      category: inferCategory("quick_win"),
      description: q.description,
      rationale: q.description,
      priority: inferPriority("quick_win"),
      impact: "medium",
      effort: normalizeEffort(q.effort),
      target_phase: inferPhase("quick_win"),
      target_modules: [],
      prerequisites: [],
      acceptance_criteria: [],
      evidence: evidenceFromLegacy(q.evidence, q.evidence_refs),
    });
  }

  for (const rec of content.refactoring_recommendations ?? []) {
    addAction({
      title: rec.title,
      category: inferCategory("refactoring", rec.category),
      description: rec.description,
      rationale: rec.description,
      priority: inferPriority("refactoring"),
      impact: "high",
      effort: normalizeEffort(rec.effort),
      target_phase: inferPhase("refactoring"),
      target_modules: rec.module_name ? [rec.module_name] : [],
      prerequisites: [],
      acceptance_criteria: [],
      evidence: evidenceFromLegacy(rec.evidence, rec.evidence_refs),
    });
  }

  for (const step of content.strangler_roadmap ?? []) {
    const stepTitle = coerceToString(step.title).trim();
    if (!stepTitle) continue;
    addAction({
      title: stepTitle,
      category: "ddd_context",
      description: step.rationale,
      rationale: step.rationale,
      priority: inferPriority("strangler"),
      impact: "high",
      effort: "L",
      target_phase: inferPhase("strangler", step.phase),
      target_modules: step.module_name ? [step.module_name] : [],
      prerequisites: step.prerequisites ?? [],
      acceptance_criteria: [],
      evidence: evidenceFromLegacy(step.evidence),
      ddd_scope: { bounded_context: step.module_name },
    });
  }

  const actions = Array.from(byTitle.values());

  const defaultPhases: GovernancePlan["phases"] = content.governance_plan?.phases?.length
    ? content.governance_plan.phases
    : [
        {
          phase: "short",
          title: "短期（0–3 月）",
          objectives: ["收敛高优先级治理行动", "修复跨层/跨上下文依赖违规"],
          success_metrics: [`Issue 数下降`, `健康分 ≥ ${Math.min(100, healthScore + 5)}`],
        },
        {
          phase: "mid",
          title: "中期（3–6 月）",
          objectives: ["明确限界上下文边界", "推进模块职责与聚合收敛"],
          success_metrics: ["上下文映射关系文档化", "核心模块耦合度下降"],
        },
        {
          phase: "long",
          title: "长期（6–12 月）",
          objectives: ["按绞杀者路线完成上下文演进", "建立复扫治理基线对比"],
          success_metrics: ["目标上下文独立部署或独立模块", "技术债密度持续下降"],
        },
      ];

  const governance_plan: GovernancePlan = {
    phases: defaultPhases,
    actions,
    strategy_notes:
      content.governance_plan?.strategy_notes ??
      content.ddd_governance?.strategy_notes ??
      "优先依赖收敛与限界上下文边界澄清，再推进聚合重构与模块拆分。",
  };

  return { ...content, governance_plan };
}

export function ensureExecutiveSummary(
  content: AiReportContent,
  healthScore: number,
  issueCount: number
): AiReportContent {
  if (content.executive_summary) return content;

  const actions = content.governance_plan?.actions ?? [];
  const sorted = [...actions].sort((a, b) => {
    const p = { urgent: 0, important: 1, normal: 2 };
    return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
  });

  const verdict: ExecutiveSummary["governance_verdict"] =
    issueCount > 10 || healthScore < 50
      ? "intervene"
      : issueCount > 0 || healthScore < 70
        ? "watch"
        : "proceed";

  const executive_summary: ExecutiveSummary = {
    governance_verdict: verdict,
    phase_goals: (content.governance_plan?.phases ?? []).map((p) => ({
      phase: p.phase,
      goal: p.objectives[0] ?? p.title,
    })),
    top_actions: sorted.slice(0, 5).map((a) => ({
      id: a.id,
      title: a.title,
      priority: a.priority,
      effort: a.effort,
      expected_outcome: a.acceptance_criteria[0] ?? a.description,
    })),
    ddd_boundary_conclusion:
      content.ddd_governance?.bounded_contexts
        ?.slice(0, 2)
        .map((bc) => `${bc.name}（${bc.context_type}）`)
        .join("；") || undefined,
    rescan_baseline: {
      health_score: healthScore,
      issue_count: issueCount,
      target_health_score: Math.min(100, healthScore + 10),
      target_issue_reduction: issueCount > 0 ? "30%" : undefined,
    },
  };

  return { ...content, executive_summary };
}

/** Minimal DDD governance fallback from structure when LLM omits ddd_governance */
export function ensureDddGovernance(
  content: AiReportContent,
  structure: StructureFacts
): AiReportContent {
  if ((content.ddd_governance?.bounded_contexts?.length ?? 0) >= 2) {
    return content;
  }

  const layerEntries = Object.entries(structure.layer_distribution).filter(
    ([, mods]) => mods.length > 0
  );

  const bounded_contexts = layerEntries.slice(0, 4).map(([layer, modules]) => ({
    name: `${layer}Context`,
    business_capability: `${layer} 层模块承载的业务与技术职责（基于分层推断）`,
    modules,
    context_type: "existing" as const,
    boundary_rationale: `扫描器将 ${modules.length} 个模块识别为 ${layer} 层，作为限界上下文划分的初始依据，需结合业务语义进一步确认。`,
    ubiquitous_language: modules.slice(0, 5).map((m) => m.split(".").pop() ?? m),
    confidence: "low" as const,
    evidence: [
      { ref: "structure", label: "分层与模块结构", kind: "fact" as const },
      ...modules.slice(0, 3).map((m) => ({
        ref: `module:${m}`,
        label: m,
        kind: "fact" as const,
      })),
    ],
  }));

  while (bounded_contexts.length < 2 && structure.modules.length > 0) {
    const mod = structure.modules[bounded_contexts.length];
    if (!mod) break;
    bounded_contexts.push({
      name: `${mod.name}Context`,
      business_capability: `模块 ${mod.name} 的业务职责（单模块上下文推断）`,
      modules: [mod.name],
      context_type: "existing" as const,
      boundary_rationale: `基于模块 ${mod.name}（${mod.layer} 层，${mod.loc} LOC）的独立边界推断。`,
      ubiquitous_language: [mod.name.split(".").pop() ?? mod.name],
      confidence: "low" as const,
      evidence: [{ ref: `module:${mod.name}`, label: mod.name, kind: "fact" as const }],
    });
  }

  const context_map: DddGovernance["context_map"] = [];
  for (const dep of structure.dependencies.slice(0, 5)) {
    const fromLayer =
      structure.modules.find((m) => m.name === dep.from)?.layer ?? "unknown";
    const toLayer = structure.modules.find((m) => m.name === dep.to)?.layer ?? "unknown";
    context_map.push({
      upstream_context: `${fromLayer}Context`,
      downstream_context: `${toLayer}Context`,
      relationship: "customer_supplier",
      integration_modules: [dep.from, dep.to],
      current_problem: `模块 ${dep.from} → ${dep.to} 存在直接依赖`,
      recommendation: "评估是否引入防腐层或应用服务隔离跨上下文调用",
      evidence: [{ ref: dep.ref, label: `${dep.from} → ${dep.to}`, kind: "fact" as const }],
    });
  }

  const ddd_governance: DddGovernance = {
    subdomain_landscape: [
      {
        name: "核心业务域",
        classification: "core",
        rationale: "基于模块规模与依赖中心度推断的核心业务区域，需架构师确认",
        related_modules: structure.modules
          .sort((a, b) => b.ca + b.ce - (a.ca + a.ce))
          .slice(0, 5)
          .map((m) => m.name),
        confidence: "low",
        evidence: [{ ref: "structure", label: "模块结构", kind: "fact" }],
      },
      {
        name: "基础设施域",
        classification: "generic",
        rationale: "Infrastructure/DAL 等通用技术模块",
        related_modules:
          structure.layer_distribution.infrastructure ??
          structure.layer_distribution.dal ??
          [],
        confidence: "low",
        evidence: [{ ref: "structure", label: "分层结构", kind: "fact" }],
      },
    ],
    bounded_contexts,
    context_map:
      context_map.length > 0
        ? context_map
        : [
            {
              upstream_context: bounded_contexts[0]?.name ?? "ContextA",
              downstream_context: bounded_contexts[1]?.name ?? "ContextB",
              relationship: "customer_supplier",
              integration_modules: [],
              recommendation: "梳理跨上下文集成方式，避免领域模型直接泄漏",
              evidence: [{ ref: "structure", label: "结构事实", kind: "fact" }],
            },
          ],
    aggregates: content.ddd_governance?.aggregates ?? [],
    modeling_gaps: content.ddd_governance?.modeling_gaps ?? [
      {
        kind: "missing_boundary",
        title: "限界上下文边界待确认",
        description:
          "当前 DDD 治理建议基于扫描结构推断，需结合业务专家工作坊进一步确认上下文边界与聚合设计。",
        affected_contexts: bounded_contexts.map((bc) => bc.name),
        evidence: [{ ref: "structure", label: "结构事实", kind: "fact" }],
      },
    ],
    strategy_notes:
      content.ddd_governance?.strategy_notes ??
      "（系统补充）基于分层与依赖的结构化推断，建议结合业务工作坊验证限界上下文与聚合设计。",
  };

  return { ...content, ddd_governance };
}
