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
