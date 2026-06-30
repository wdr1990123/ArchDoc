import type { ModuleContextPack } from "@/lib/metrics/moduleContextPack";

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
