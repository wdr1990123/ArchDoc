import type {
  AiReportContent,
  EvidenceItem,
  IssueInterpretation,
  ModuleRoleEntry,
} from "@/lib/types";
import type {
  StructureFacts,
  StructureModuleFact,
} from "@/lib/metrics/structureFacts";
import type { ModuleContextPack } from "@/lib/metrics/moduleContextPack";
import {
  ensureDesignHypotheses,
  normalizeReportEvidenceRefs,
  syncEvidenceRefs,
} from "@/lib/validation/reportValidator";

export const MODULE_BATCH_THRESHOLD = 25;
export const MODULE_BATCH_SIZE = 5;
/** Defer module_roles to batched follow-up calls to avoid huge single responses */
export const MODULE_ROLES_SPLIT_THRESHOLD = 10;
const DEPENDENCY_PROMPT_CAP = 80;
const METRICS_PROMPT_CAP = 120;

function compactModulesForPrompt(modules: StructureModuleFact[]) {
  return modules.map((m) => ({
    name: m.name,
    layer: m.layer,
    loc: m.loc,
    ce: m.ce,
    ca: m.ca,
    issue_count: m.issue_count,
    top_types: m.top_types?.slice(0, 6) ?? [],
  }));
}

function compactStructureForPrompt(structure: StructureFacts) {
  return {
    total_modules: structure.total_modules,
    total_loc: structure.total_loc,
    layer_distribution: structure.layer_distribution,
    modules: compactModulesForPrompt(structure.modules),
    dependencies: structure.dependencies.slice(0, DEPENDENCY_PROMPT_CAP),
    dependencies_truncated:
      structure.dependencies.length > DEPENDENCY_PROMPT_CAP
        ? structure.dependencies.length - DEPENDENCY_PROMPT_CAP
        : 0,
    package_refs: structure.package_refs,
  };
}

export interface ReportIssueInput {
  id: string;
  rule_id: string;
  severity: string;
  message: string;
  module_names?: string[];
}

export interface ReportMarkdownMeta {
  projectName?: string;
  solutionPath?: string;
  reportStatus?: string;
  createdAt?: string;
}

const SEVERITY_ZH: Record<string, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
};

const EFFORT_ZH: Record<string, string> = {
  S: "小",
  M: "中",
  L: "大",
};

const CONFIDENCE_ZH: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function summarizeDeepFacts(
  facts?: Array<{
    name: string;
    layer: string | null;
    metadata: Record<string, unknown>;
  }>
) {
  return (facts ?? []).map((m) => {
    const surface = m.metadata.public_surface as Array<{ type_name: string }> | undefined;
    const typeNames = (surface ?? []).slice(0, 12).map((t) => t.type_name);
    return {
      name: m.name,
      layer: m.layer,
      public_types: typeNames,
      namespace_count: (m.metadata.namespaces as string[] | undefined)?.length ?? 0,
    };
  });
}

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

export function buildModuleIntentPrompt(input: {
  projectName: string;
  solutionPath: string;
  healthScore: number;
  context: ModuleContextPack;
}): { system: string; user: string } {
  const { context: ctx } = input;
  const deepReadNote = ctx.has_deep_read
    ? ""
    : "\n\n注意：当前扫描无 schema 1.1 深读数据（public_surface/namespaces），请主要基于模块名、依赖与指标推断，并在 summary 中说明「深读数据不足，解读置信度受限」。";

  const system = `你是一位资深 .NET 架构师，精通 DDD 战术设计，正在解读 MES 系统中单个模块的业务逻辑与领域模型。

你是「解读者」而非「发现者」——模块名、依赖、Public API、指标必须来自输入 JSON，不得臆造类型或接口。

硬性规则：
- report_version 必须为 "2.0"
- module_intent 与 module_ddd_profile 是模块报告核心章节，必须完整填写
- upstream_modules / downstream_modules 必须来自 context.dependencies（事实）
- external_interfaces 必须基于 metadata.public_surface；evidence 使用 "type:{module_name}:{TypeName}"
- aggregate_candidates 的 type_name 必须来自 public_surface；ref 必须为 "type:{module_name}:{TypeName}"
- core_entities、business_capabilities、key_workflows 为推断，evidence 的 kind 必须为 inference 且含 confidence
- key_workflows 至少 1 条、最多 4 条；business_capabilities 至少 2 条；core_entities 至少 2 条
- governance_plan.actions 至少 2 条（模块边界/聚合治理），每条含 acceptance_criteria
- 所有面向用户的文本字段必须使用简体中文
- 仅输出合法 JSON，不要 Markdown 或解释文字
- risks/quick_wins/refactoring_recommendations 各不超过 3 条`;

  const user = `请为以下模块生成 Report V2 业务逻辑深度解读（简体中文）。${deepReadNote}

项目：${input.projectName}
解决方案：${input.solutionPath}
健康分：${input.healthScore}/100
聚焦模块：${ctx.module_name}

=== module_context（完整事实，勿截断）===
${JSON.stringify(ctx, null, 2)}

返回 JSON 结构（report_version 必须为 "2.0"）：
{
  "report_version": "2.0",
  "summary": "4-6 句模块总体解读，含分层角色、主要业务能力、依赖特征",
  "module_intent": {
    "module_name": "${ctx.module_name}",
    "purpose": "3-5 句模块定位与职责",
    "business_capabilities": ["能力1", "能力2"],
    "core_entities": ["实体1", "实体2"],
    "key_workflows": [
      {
        "name": "流程名",
        "description": "业务链路描述，可提及上下游模块",
        "involved_modules": ["其他模块名"],
        "evidence": [{ "ref": "module:${ctx.module_name}", "label": "...", "kind": "inference", "confidence": "medium" }]
      }
    ],
    "external_interfaces": [
      {
        "name": "PublicTypeName",
        "kind": "service",
        "summary": "该类型/接口的业务作用",
        "evidence": [{ "ref": "type:${ctx.module_name}:PublicTypeName", "label": "PublicTypeName", "kind": "fact" }]
      }
    ],
    "upstream_modules": [],
    "downstream_modules": [],
    "confidence": "high|medium|low",
    "evidence": [{ "ref": "module:${ctx.module_name}", "label": "${ctx.module_name}", "kind": "fact" }]
  },
  "module_roles": [
    {
      "module_name": "${ctx.module_name}",
      "layer": "${ctx.layer}",
      "responsibility_hypothesis": "与 module_intent.purpose 一致的 1-2 句摘要",
      "confidence": "high|medium|low",
      "key_types": [],
      "evidence": [{ "ref": "module:${ctx.module_name}", "label": "${ctx.module_name}", "kind": "inference", "confidence": "medium" }]
    }
  ],
  "module_ddd_profile": {
    "bounded_context_membership": {
      "context_name": "推断的限界上下文名",
      "role_in_context": "primary|secondary|integration",
      "confidence": "medium"
    },
    "aggregate_candidates": [
      {
        "type_name": "PublicTypeName",
        "ref": "type:${ctx.module_name}:PublicTypeName",
        "role": "aggregate_root|entity|value_object|domain_service",
        "rationale": "推断依据",
        "evidence": [{ "ref": "type:${ctx.module_name}:PublicTypeName", "label": "PublicTypeName", "kind": "inference", "confidence": "medium" }]
      }
    ],
    "boundary_recommendations": ["模块边界治理建议"],
    "anti_corruption_needed": false
  },
  "governance_plan": {
    "phases": [{ "phase": "short", "title": "短期", "objectives": ["模块边界收敛"], "success_metrics": ["依赖违规减少"] }],
    "actions": [{
      "id": "GA-001", "title": "", "category": "boundary|ddd_aggregate",
      "description": "", "rationale": "", "priority": "important", "impact": "medium",
      "effort": "M", "target_phase": "short", "target_modules": ["${ctx.module_name}"],
      "prerequisites": [], "acceptance_criteria": ["可验证标准"], "evidence": []
    }],
    "strategy_notes": ""
  },
  "executive_summary": {
    "governance_verdict": "watch",
    "phase_goals": [{ "phase": "short", "goal": "模块边界与聚合收敛" }],
    "top_actions": [{ "id": "GA-001", "title": "", "priority": "important", "effort": "M", "expected_outcome": "" }],
    "ddd_boundary_conclusion": "本模块在上下文中的定位一句话"
  },
  "risks": [],
  "quick_wins": [],
  "refactoring_recommendations": []
}

要求：
- upstream_modules = context.dependencies.upstream；downstream_modules = context.dependencies.downstream
- external_interfaces 覆盖 public_surface 中最能代表业务入口的类型（最多 8 个）
- 若 issue_count > 0，risks 至少 1 条且引用 issue: 或 rule:`;

  return { system, user };
}

function renderEvidenceList(items: EvidenceItem[] | undefined, legacy?: string[]): string {
  const lines: string[] = [];
  for (const e of items ?? []) {
    const conf = e.confidence ? ` · 置信度：${CONFIDENCE_ZH[e.confidence] ?? e.confidence}` : "";
    const kind = e.kind === "inference" ? "推断" : "事实";
    lines.push(`- [${kind}] ${e.label} (\`${e.ref}\`)${conf}`);
  }
  for (const ref of legacy ?? []) {
    if (items?.some((e) => e.ref === ref)) continue;
    lines.push(`- \`${ref}\``);
  }
  return lines.length ? lines.join("\n") : "—";
}

export function reportToMarkdown(
  content: AiReportContent,
  meta?: ReportMarkdownMeta
): string {
  const lines: string[] = [];
  lines.push("# 架构治理行动方案（V2）\n");
  if (meta) {
    if (meta.projectName) lines.push(`- **项目**：${meta.projectName}`);
    if (meta.solutionPath) lines.push(`- **解决方案**：${meta.solutionPath}`);
    if (meta.reportStatus) lines.push(`- **状态**：${meta.reportStatus}`);
    if (meta.createdAt) lines.push(`- **生成时间**：${meta.createdAt}`);
    lines.push(`- **报告版本**：${content.report_version ?? "2.0"}`);
    lines.push("");
  }

  if (content.executive_summary) {
    const es = content.executive_summary;
    const verdictZh: Record<string, string> = {
      proceed: "可推进",
      watch: "需关注",
      intervene: "需干预",
    };
    lines.push("## 治理结论摘要\n");
    lines.push(`- **治理紧迫度**：${verdictZh[es.governance_verdict] ?? es.governance_verdict}`);
    if (es.ddd_boundary_conclusion) {
      lines.push(`- **DDD 边界结论**：${es.ddd_boundary_conclusion}`);
    }
    if (es.top_actions?.length) {
      lines.push("\n**Top 治理行动：**\n");
      for (const a of es.top_actions) {
        lines.push(`- **${a.id}** ${a.title}（${a.priority} · 工作量 ${EFFORT_ZH[a.effort] ?? a.effort}）— ${a.expected_outcome}`);
      }
    }
    if (es.defer_items?.length) {
      lines.push("\n**暂不治理：**\n");
      for (const d of es.defer_items) lines.push(`- ${d}`);
    }
    lines.push("");
  }

  lines.push(`## 总体概述\n\n${content.summary}\n`);

  if (content.governance_plan) {
    lines.push("## 治理行动方案\n");
    if (content.governance_plan.strategy_notes) {
      lines.push(`${content.governance_plan.strategy_notes}\n`);
    }
    for (const phase of content.governance_plan.phases ?? []) {
      const phaseZh: Record<string, string> = { short: "短期", mid: "中期", long: "长期" };
      lines.push(`### ${phase.title || phaseZh[phase.phase] || phase.phase}\n`);
      if (phase.objectives?.length) lines.push(`目标：${phase.objectives.join("；")}\n`);
      if (phase.success_metrics?.length) lines.push(`验收：${phase.success_metrics.join("；")}\n`);
    }
    for (const action of content.governance_plan.actions ?? []) {
      lines.push(`#### ${action.id} ${action.title}\n`);
      lines.push(`类别：${action.category} · 优先级：${action.priority} · 影响：${action.impact} · 工作量：${EFFORT_ZH[action.effort] ?? action.effort} · 阶段：${action.target_phase}\n`);
      lines.push(`${action.description}\n`);
      if (action.acceptance_criteria?.length) {
        lines.push("**验收标准：**\n");
        for (const c of action.acceptance_criteria) lines.push(`- ${c}`);
        lines.push("");
      }
      lines.push(renderEvidenceList(action.evidence, action.evidence_refs));
      lines.push("");
    }
  }

  if (content.ddd_governance) {
    const ddd = content.ddd_governance;
    lines.push("## DDD 领域治理\n");
    if (ddd.strategy_notes) lines.push(`${ddd.strategy_notes}\n`);

    if (ddd.subdomain_landscape?.length) {
      lines.push("### 子域全景\n");
      for (const sub of ddd.subdomain_landscape) {
        lines.push(`- **${sub.name}**（${sub.classification}）：${sub.rationale}`);
      }
      lines.push("");
    }

    if (ddd.bounded_contexts?.length) {
      lines.push("### 限界上下文\n");
      for (const bc of ddd.bounded_contexts) {
        lines.push(`#### ${bc.name}（${bc.context_type}）\n`);
        lines.push(`${bc.business_capability}\n\n${bc.boundary_rationale}\n`);
        lines.push(`模块：${(bc.modules ?? []).join("、")}\n`);
        if (bc.ubiquitous_language?.length) {
          lines.push(`通用语言：${bc.ubiquitous_language.join("、")}\n`);
        }
        lines.push(renderEvidenceList(bc.evidence));
        lines.push("");
      }
    }

    if (ddd.context_map?.length) {
      lines.push("### 上下文映射\n");
      for (const cm of ddd.context_map) {
        lines.push(`- **${cm.upstream_context}** → **${cm.downstream_context}**（${cm.relationship}）`);
        lines.push(`  ${cm.recommendation}`);
      }
      lines.push("");
    }

    if (ddd.aggregates?.length) {
      lines.push("### 聚合设计\n");
      for (const agg of ddd.aggregates) {
        lines.push(`#### ${agg.name}（${agg.bounded_context}）\n`);
        lines.push(`聚合根：\`${agg.aggregate_root.ref}\`\n`);
        if (agg.invariants?.length) lines.push(`不变量：${agg.invariants.join("；")}\n`);
        if (agg.design_concerns?.length) lines.push(`关注点：${agg.design_concerns.join("；")}\n`);
        lines.push(renderEvidenceList(agg.evidence));
        lines.push("");
      }
    }

    if (ddd.modeling_gaps?.length) {
      lines.push("### 建模差距\n");
      for (const gap of ddd.modeling_gaps) {
        lines.push(`- **${gap.title}**（${gap.kind}）：${gap.description}`);
      }
      lines.push("");
    }
  }

  if (content.module_ddd_profile) {
    const profile = content.module_ddd_profile;
    lines.push("## 模块 DDD 画像\n");
    lines.push(`限界上下文：${profile.bounded_context_membership.context_name}（${profile.bounded_context_membership.role_in_context}）\n`);
    if (profile.aggregate_candidates?.length) {
      lines.push("**聚合候选：**\n");
      for (const c of profile.aggregate_candidates) {
        lines.push(`- **${c.type_name}**（${c.role}）：${c.rationale}`);
      }
      lines.push("");
    }
    if (profile.boundary_recommendations?.length) {
      lines.push("**边界建议：**\n");
      for (const r of profile.boundary_recommendations) lines.push(`- ${r}`);
      lines.push("");
    }
  }

  lines.push("---\n\n## 附录：诊断依据\n");

  if (content.architecture_overview) {
    const o = content.architecture_overview;
    lines.push("## 架构总览（事实）\n");
    lines.push(`- 模块数：${o.module_count}`);
    lines.push(`- 代码行数：${o.total_loc.toLocaleString("zh-CN")}`);
    lines.push(`- 健康分：${o.health_score}/100`);
    lines.push(`- Issue 数：${o.issue_count}`);
    lines.push("- 分层分布：");
    for (const [layer, mods] of Object.entries(o.layer_distribution ?? {})) {
      lines.push(`  - **${layer}**：${(mods ?? []).join("、")}`);
    }
    lines.push("");
  }

  if (content.key_dependency_chains?.length) {
    lines.push("## 关键依赖链（事实）\n");
    for (const chain of content.key_dependency_chains) {
      const path = chain.path?.length ? chain.path.join(" → ") : "（见证据）";
      lines.push(`### ${path}\n`);
      lines.push(`原因：${chain.reason}\n`);
      lines.push(renderEvidenceList(chain.evidence));
      lines.push("");
    }
  }

  if (content.issue_interpretations?.length) {
    lines.push("## 架构问题解读\n");
    for (const item of content.issue_interpretations) {
      const sev = SEVERITY_ZH[item.severity] ?? item.severity;
      lines.push(`### ${item.rule_id}（${sev}）\n`);
      lines.push(`**消息**：${item.message}\n`);
      if (item.module_names?.length) {
        lines.push(`**涉及模块**：${item.module_names.join("、")}\n`);
      }
      lines.push(`**解读**：${item.interpretation}\n`);
      lines.push(renderEvidenceList(item.evidence));
      lines.push("");
    }
  }

  if (content.module_intent) {
    const intent = content.module_intent;
    const conf = CONFIDENCE_ZH[intent.confidence] ?? intent.confidence;
    lines.push("## 业务逻辑解读\n");
    lines.push(`### ${intent.module_name}\n`);
    lines.push(`**模块定位**（置信度：${conf}）：${intent.purpose}\n`);
    if (intent.business_capabilities?.length) {
      lines.push("**业务能力：**\n");
      for (const cap of intent.business_capabilities) {
        lines.push(`- ${cap}`);
      }
      lines.push("");
    }
    if (intent.core_entities?.length) {
      lines.push(`**核心实体：** ${intent.core_entities.join("、")}\n`);
    }
    if (intent.upstream_modules?.length || intent.downstream_modules?.length) {
      lines.push(
        `**依赖：** 上游 ${intent.upstream_modules?.join("、") || "—"} · 下游 ${intent.downstream_modules?.join("、") || "—"}\n`
      );
    }
    if (intent.key_workflows?.length) {
      lines.push("### 关键流程\n");
      for (const wf of intent.key_workflows) {
        lines.push(`#### ${wf.name}\n\n${wf.description}\n`);
        if (wf.involved_modules?.length) {
          lines.push(`涉及模块：${wf.involved_modules.join("、")}\n`);
        }
        lines.push(renderEvidenceList(wf.evidence));
        lines.push("");
      }
    }
    if (intent.external_interfaces?.length) {
      lines.push("### 对外接口\n");
      for (const iface of intent.external_interfaces) {
        lines.push(`- **${iface.name}**（${iface.kind}）：${iface.summary}`);
      }
      lines.push("");
    }
    lines.push(renderEvidenceList(intent.evidence));
    lines.push("");
  }

  if (content.module_roles?.length) {
    lines.push("## 模块职责表（AI 推断）\n");
    for (const role of content.module_roles) {
      const conf = CONFIDENCE_ZH[role.confidence] ?? role.confidence;
      lines.push(`### ${role.module_name}（${role.layer}）\n`);
      lines.push(`**职责推断**（置信度：${conf}）：${role.responsibility_hypothesis}\n`);
      if (role.key_types?.length) {
        lines.push(`关键类型：${role.key_types.join("、")}\n`);
      }
      lines.push(renderEvidenceList(role.evidence));
      lines.push("");
    }
  }

  if (content.design_hypotheses?.length) {
    lines.push("## 设计意图推断\n");
    for (const h of content.design_hypotheses) {
      const conf = CONFIDENCE_ZH[h.confidence] ?? h.confidence;
      lines.push(`### ${h.title}（置信度：${conf}）\n\n${h.description}\n`);
      lines.push(`依据：${(h.based_on_refs ?? []).join(", ")}\n`);
    }
  }

  if (content.risks?.length) {
    lines.push("## 主要风险\n");
    for (const r of content.risks) {
      const sev = SEVERITY_ZH[r.severity] ?? r.severity;
      lines.push(`### ${r.title}（${sev}）\n\n${r.description}\n`);
      lines.push("证据：\n");
      lines.push(renderEvidenceList(r.evidence, r.evidence_refs));
      lines.push("");
    }
  } else {
    lines.push("## 主要风险\n\n规则引擎未命中 Issue，暂无高风险项。请结合关键依赖链与模块职责进一步评审。\n");
  }

  if (content.quick_wins?.length) {
    lines.push("## 快速改进项\n");
    for (const q of content.quick_wins) {
      const effort = EFFORT_ZH[q.effort] ?? q.effort;
      lines.push(`### ${q.title} [工作量：${effort}]\n\n${q.description}\n`);
      lines.push(renderEvidenceList(q.evidence, q.evidence_refs));
      lines.push("");
    }
  }

  if (content.refactoring_recommendations?.length) {
    lines.push("## 重构建议\n");
    for (const rec of content.refactoring_recommendations) {
      const effort = EFFORT_ZH[rec.effort] ?? rec.effort;
      lines.push(
        `### ${rec.title}\n\n**类别：** ${rec.category} | **工作量：** ${effort}${rec.module_name ? ` | **模块：** ${rec.module_name}` : ""}\n\n${rec.description}\n`
      );
      lines.push(renderEvidenceList(rec.evidence, rec.evidence_refs));
      lines.push("");
    }
  }

  if (content.strangler_roadmap?.length) {
    lines.push("## 绞杀者迁移路线图\n");
    for (const step of content.strangler_roadmap) {
      lines.push(`### 阶段 ${step.phase}：${step.title}\n`);
      lines.push(`目标模块：**${step.module_name}**\n\n${step.rationale}\n`);
      if (step.prerequisites?.length) {
        lines.push(`前置条件：${step.prerequisites.join("；")}\n`);
      }
      lines.push(renderEvidenceList(step.evidence));
      lines.push("");
    }
  }

  if (content.strangler_candidates?.length) {
    lines.push("## 绞杀者候选模块\n");
    for (const c of content.strangler_candidates) {
      lines.push(`- **${c.module_name}**（评分：${c.score}）：${c.rationale}`);
      lines.push(renderEvidenceList(c.evidence, c.evidence_refs));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Inject Scanner facts and merge issue interpretations */
export function enrichReportContent(
  content: AiReportContent,
  structure: StructureFacts,
  healthScore: number,
  issues: ReportIssueInput[] = []
): AiReportContent {
  const key_dependency_chains = structure.key_dependency_chains.map((chain) => ({
    path: chain.path,
    reason: chain.reason,
    evidence: [
      {
        ref: chain.ref,
        label: chain.path.length ? chain.path.join(" → ") : chain.reason,
        kind: "fact" as const,
      },
    ],
  }));

  const llmByRef = new Map(
    (content.issue_interpretations ?? []).map((item) => [item.issue_ref, item])
  );

  const issue_interpretations: IssueInterpretation[] = issues.map((issue) => {
    const issue_ref = `issue:${issue.id}`;
    const llm = llmByRef.get(issue_ref);
    return {
      issue_ref,
      rule_id: issue.rule_id,
      severity: issue.severity,
      message: issue.message,
      module_names: issue.module_names,
      interpretation: llm?.interpretation?.trim() || issue.message,
      evidence:
        llm?.evidence ??
        [
          {
            ref: issue_ref,
            label: issue.message,
            kind: "fact" as const,
          },
        ],
    };
  });

  const merged = {
    ...content,
    report_version: "2.1" as const,
    architecture_overview: {
      module_count: structure.total_modules,
      total_loc: structure.total_loc,
      health_score: healthScore,
      layer_distribution: structure.layer_distribution,
      issue_count: structure.issue_count,
    },
    key_dependency_chains,
    issue_interpretations,
  };

  return syncEvidenceRefs(
    normalizeReportEvidenceRefs(ensureDesignHypotheses(merged, structure), structure)
  );
}

/** Merge module_roles from a batch response into existing content */
export function mergeModuleRoles(
  content: AiReportContent,
  batchRoles: ModuleRoleEntry[],
  structure?: StructureFacts
): AiReportContent {
  const byName = new Map(
    (content.module_roles ?? []).map((r) => [r.module_name, r])
  );
  for (const role of batchRoles) {
    const name = typeof role.module_name === "string" ? role.module_name.trim() : "";
    if (!name) continue;
    if (structure && !structure.modules.some((m) => m.name === name)) continue;
    byName.set(name, role);
  }
  return {
    ...content,
    module_roles: Array.from(byName.values()),
  };
}

export function getMissingModuleNames(
  content: AiReportContent,
  structure: StructureFacts
): string[] {
  const covered = new Set((content.module_roles ?? []).map((r) => r.module_name));
  return structure.modules.map((m) => m.name).filter((name) => !covered.has(name));
}
