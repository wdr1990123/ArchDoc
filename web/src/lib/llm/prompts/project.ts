import type { StructureFacts, StructureModuleFact } from "@/lib/metrics/structureFacts";
import {
  METRICS_PROMPT_CAP,
  compactStructureForPrompt,
  summarizeDeepFacts,
  type ReportIssueInput,
} from "@/lib/llm/prompts/shared";

export type { ReportIssueInput } from "@/lib/llm/prompts/shared";
export {
  MODULE_BATCH_THRESHOLD,
  MODULE_BATCH_SIZE,
  MODULE_ROLES_SPLIT_THRESHOLD,
} from "@/lib/llm/prompts/shared";

export function buildDiagnosisPrompt(input: {
  reportType: "project" | "module";
  focusModuleName?: string;
  projectName: string;
  solutionPath: string;
  healthScore: number;
  issueCounts: Record<string, number>;
  structure: StructureFacts;
  issues: ReportIssueInput[];
  metrics: Array<{ id: string; code: string; module_name: string | null; value: number }>;
  summaries: Array<{ module_name: string; top_types: string[] }>;
  module_deep_facts?: Array<{
    name: string;
    layer: string | null;
    metadata: Record<string, unknown>;
  }>;
  deferModuleRoles?: boolean;
  module_intent_rollup?: Array<{
    module_name: string;
    purpose: string;
    business_capabilities: string[];
    core_entities: string[];
    bounded_context?: string;
    aggregate_candidates: Array<{ type_name: string; role: string; ref: string }>;
  }>;
}): { system: string; user: string } {
  const moduleNames = input.structure.modules.map((m) => m.name);
  const deferModuleRoles =
    input.deferModuleRoles ?? input.reportType === "project";
  const cappedMetrics = input.metrics.slice(0, METRICS_PROMPT_CAP);
  const metricsTruncated = input.metrics.length - cappedMetrics.length;
  const scopeNote =
    input.reportType === "module" && input.focusModuleName
      ? `\n\n本次为**模块级报告**，聚焦模块：${input.focusModuleName}。重点分析其职责、依赖关系与拆分可行性。`
      : "";

  const system = `你是一位资深 .NET 架构师，精通 DDD 战略设计（限界上下文、上下文映射、子域划分）与战术设计（聚合、聚合根、实体、值对象）。

你的任务是生成「DDD 治理行动方案」——诊断仅作依据，治理建议与规划是报告主体。

你是「解读者」而非「发现者」——所有数值、模块名、依赖关系、类型名必须来自输入 JSON，不得臆造。

硬性规则：
- report_version 必须为 "2.0"
- 架构总览、关键依赖链由系统自动注入，**不要输出** architecture_overview、key_dependency_chains、issue_interpretations
- kind 为 fact 的 evidence 只能引用 issue:/metric:/dep:/module:/package:/rule:/structure: 或裸 ref structure
- kind 为 inference 的 evidence 必须包含 confidence（high|medium|low）
- aggregate_root.ref 必须使用 "type:{module_name}:{TypeName}"，TypeName 必须来自 public_surface
- 若 issues 为空：不得编造 critical/high 风险；governance_plan.actions 仍至少 3 条（基于结构/依赖治理）
- 所有面向用户的文本字段必须使用简体中文
- severity：critical|high|medium|low；effort：S|M|L；priority：urgent|important|normal；impact：high|medium|low
- target_phase：short（0-3月）| mid（3-6月）| long（6-12月）
- 仅输出合法 JSON，不要 Markdown 或解释文字
${deferModuleRoles
  ? "- module_roles 由系统分批生成，本次输出 module_roles: []"
  : "- module_roles 必须覆盖 structure.modules 每一个模块名"}
- 必填章节：summary（3-4句）、executive_summary、governance_plan、ddd_governance、risks、quick_wins、refactoring_recommendations、strangler_candidates、strangler_roadmap
- design_hypotheses 可选；module_roles 职责信息服务于边界治理
- 每条 governance_plan.actions 必须含 acceptance_criteria（≥1条可验证标准）和 rationale（引用 evidence）
- ddd_governance.bounded_contexts 至少 2 个；context_map 至少 1 条；modeling_gaps 至少 1 条
- 必须输出 executive_summary.defer_items：至少 1 项「当前不建议治理」及原因`;

  const user = `请分析以下 .NET MES 解决方案并生成 DDD 治理行动方案（Report V2，简体中文）。${scopeNote}

项目：${input.projectName}
解决方案：${input.solutionPath}
健康分：${input.healthScore}/100
问题统计：${JSON.stringify(input.issueCounts)}
Issue 总数：${input.structure.issue_count}
模块列表：${JSON.stringify(moduleNames)}
${deferModuleRoles ? "（module_roles 将分批生成，本次输出 []）" : "（module_roles 必须全部覆盖）"}

=== structure（确定性事实）===
${JSON.stringify(compactStructureForPrompt(input.structure), null, 2)}

架构问题（evidence 使用 "issue:{id}" 或 "rule:{rule_id}"）：
${JSON.stringify(input.issues, null, 2)}

指标（evidence 使用 "metric:{id}" 或 "metric:{code}@{module_name}"）：
${JSON.stringify(cappedMetrics, null, 2)}${metricsTruncated > 0 ? `\n（其余 ${metricsTruncated} 条指标已省略）` : ""}

模块摘要（top_types）：
${JSON.stringify(input.summaries, null, 2)}

模块深读摘要（public_surface / namespaces，用于聚合根推断）：
${JSON.stringify(summarizeDeepFacts(input.module_deep_facts), null, 2)}
${
  input.module_intent_rollup?.length
    ? `\n模块级报告 rollup（已有模块业务解读，优先用于 DDD 边界与聚合推断）：\n${JSON.stringify(input.module_intent_rollup, null, 2)}`
    : ""
}

返回 JSON（勿含 architecture_overview / key_dependency_chains）：
{
  "report_version": "2.0",
  "summary": "3-4 句治理导向概述：核心域/边界结论、主要治理方向",
  "executive_summary": {
    "governance_verdict": "proceed|watch|intervene",
    "phase_goals": [{ "phase": "short|mid|long", "goal": "阶段目标一句话" }],
    "top_actions": [{ "id": "GA-001", "title": "", "priority": "urgent|important|normal", "effort": "S|M|L", "expected_outcome": "" }],
    "ddd_boundary_conclusion": "限界上下文/边界一句话结论",
    "defer_items": ["暂不治理项及原因"]
  },
  "governance_plan": {
    "phases": [{ "phase": "short|mid|long", "title": "", "objectives": [], "success_metrics": [] }],
    "actions": [{
      "id": "GA-001", "title": "", "category": "ddd_context|ddd_aggregate|ddd_integration|architecture|application|technical_debt|boundary|dependency",
      "description": "", "rationale": "", "priority": "urgent|important|normal", "impact": "high|medium|low",
      "effort": "S|M|L", "target_phase": "short|mid|long", "target_modules": [], "prerequisites": [],
      "acceptance_criteria": ["可验证验收标准"], "evidence": [{ "ref": "module:...", "label": "...", "kind": "fact|inference" }],
      "ddd_scope": { "bounded_context": "", "aggregate": "" }
    }],
    "strategy_notes": "如：先划上下文边界，再收敛聚合"
  },
  "ddd_governance": {
    "subdomain_landscape": [{ "name": "", "classification": "core|supporting|generic", "rationale": "", "related_modules": [], "confidence": "medium", "evidence": [] }],
    "bounded_contexts": [{
      "name": "", "business_capability": "", "modules": [], "namespace_hints": [],
      "context_type": "existing|recommended_split|recommended_merge",
      "boundary_rationale": "", "ubiquitous_language": [], "confidence": "medium", "evidence": [],
      "linked_governance_actions": ["GA-001"]
    }],
    "context_map": [{
      "upstream_context": "", "downstream_context": "", "relationship": "customer_supplier|anticorruption_layer|partnership|shared_kernel|conformist|open_host_service|published_language",
      "integration_modules": [], "current_problem": "", "recommendation": "", "evidence": [],
      "linked_governance_actions": ["GA-001"]
    }],
    "aggregates": [{
      "name": "", "bounded_context": "",
      "aggregate_root": { "type_name": "", "module_name": "", "ref": "type:Module:TypeName" },
      "entities": [], "value_objects": [], "invariants": [], "consistency_boundary_note": "",
      "design_concerns": [], "confidence": "medium", "evidence": [], "linked_governance_actions": ["GA-001"]
    }],
    "modeling_gaps": [{ "kind": "cross_context_leak|missing_boundary|anemic_domain|god_aggregate|language_mismatch", "title": "", "description": "", "affected_contexts": [], "evidence": [], "linked_governance_actions": ["GA-001"] }],
    "strategy_notes": ""
  },
  "module_roles": ${deferModuleRoles ? "[]" : `[{ "module_name": "", "layer": "", "responsibility_hypothesis": "", "confidence": "medium", "key_types": [], "evidence": [] }]`},
  "risks": [{ "title": "", "severity": "medium|low", "description": "", "evidence": [] }],
  "quick_wins": [{ "title": "", "description": "", "effort": "S|M|L", "evidence": [] }],
  "refactoring_recommendations": [{ "title": "", "category": "", "description": "", "effort": "S|M|L", "module_name": "", "evidence": [] }],
  "strangler_candidates": [{ "module_name": "", "score": 0, "rationale": "", "evidence": [] }],
  "strangler_roadmap": [{ "phase": 1, "title": "", "module_name": "", "prerequisites": [], "rationale": "", "evidence": [] }]
}

要求：
- governance_plan.actions 至少 5 条，覆盖 DDD 边界/聚合/集成类行动
- 无 public_surface 时 aggregates 可为 []，但 bounded_contexts 仍至少 2 个
- quick_wins/refactoring 不得与 governance_plan.actions 重复标题
- 无 Issue 时 risks 可为空；summary 说明「规则引擎未命中 Issue」`;

  return { system, user };
}

/** Supplement missing module_roles in batches for large solutions */
export function buildModuleRolesBatchPrompt(input: {
  projectName: string;
  modules: StructureModuleFact[];
  summaries: Array<{ module_name: string; top_types: string[] }>;
  module_deep_facts?: Array<{
    name: string;
    layer: string | null;
    metadata: Record<string, unknown>;
  }>;
}): { system: string; user: string } {
  const moduleNames = input.modules.map((m) => m.name);
  const system = `你是一位资深 .NET 架构师。仅输出 module_roles 数组的合法 JSON，report_version 2.0，简体中文。
每个模块必须有 module_name（禁止使用 module 字段）、responsibility_hypothesis（2-4 句）、confidence、key_types、evidence。
evidence 的 kind 为 inference 时必须含 confidence。
类型证据必须使用 "type:{module_name}:{TypeName}"（禁止省略 module_name 前缀）；模块级事实用 "module:{module_name}"。
仅引用输入中的模块名与类型。不要 Markdown。`;

  const user = `项目：${input.projectName}
为以下模块生成 module_roles（必须覆盖全部 ${moduleNames.length} 个模块）：
${JSON.stringify(moduleNames)}

模块事实：
${JSON.stringify(input.modules, null, 2)}

模块摘要：
${JSON.stringify(
  input.summaries.filter((s) => moduleNames.includes(s.module_name)),
  null,
  2
)}

深读摘要：
${JSON.stringify(
  summarizeDeepFacts(
    input.module_deep_facts?.filter((m) => moduleNames.includes(m.name))
  ),
  null,
  2
)}

返回 JSON：
{
  "report_version": "2.0",
  "module_roles": [
    {
      "module_name": "模块名",
      "layer": "...",
      "responsibility_hypothesis": "...",
      "confidence": "high|medium|low",
      "key_types": [],
      "evidence": [{ "ref": "type:模块名:PublicTypeName", "label": "...", "kind": "fact|inference", "confidence": "..." }]
    }
  ]
}`;

  return { system, user };
}
