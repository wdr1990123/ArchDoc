import type { AiReportContent, GovernanceAction } from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";
import { coerceToString, coerceToStringArray } from "@/lib/validation/reportValidator";
import type { ReportIssueInput } from "@/lib/llm/prompts";
import {
  collectActionEvidenceRefs,
  nextActionId,
  sanitizeGovernanceAction,
} from "@/lib/governance/planUtils";

/** Ensure DDD recommendations have linked governance actions */
export function linkDddToGovernanceActions(
  content: AiReportContent,
  _structure: StructureFacts,
  _healthScore: number
): AiReportContent {
  const ddd = content.ddd_governance;
  if (!ddd) return content;

  const actions = (content.governance_plan?.actions ?? [])
    .map((action, index) => sanitizeGovernanceAction(action, index + 1))
    .filter((action): action is GovernanceAction => action !== null);
  const byTitle = new Map(actions.map((a) => [a.title, a]));
  let seq = actions.length + 1;

  const ensureAction = (
    title: string,
    partial: Omit<GovernanceAction, "id" | "title">
  ): GovernanceAction => {
    const key = coerceToString(title).trim() || `治理行动 ${seq + 1}`;
    const existing = byTitle.get(key);
    if (existing) return existing;
    const action: GovernanceAction = {
      ...partial,
      id: nextActionId(++seq),
      title: key,
      acceptance_criteria:
        partial.acceptance_criteria?.length > 0
          ? partial.acceptance_criteria
          : [`完成「${key}」且复扫验证通过`],
    };
    actions.push(action);
    byTitle.set(action.title, action);
    return action;
  };

  const bounded_contexts = (ddd.bounded_contexts ?? []).map((bc) => {
    if (bc.context_type === "existing" && bc.linked_governance_actions?.length) return bc;

    if (bc.context_type === "recommended_split" || bc.context_type === "recommended_merge") {
      const verb = bc.context_type === "recommended_split" ? "拆分" : "合并";
      const title = `${verb}限界上下文：${bc.name}`;
      const action = ensureAction(title, {
        category: "ddd_context",
        description: bc.boundary_rationale,
        rationale: bc.boundary_rationale,
        priority: "important",
        impact: "high",
        effort: "L",
        target_phase: "mid",
        target_modules: coerceToStringArray(bc.modules),
        prerequisites: [],
        acceptance_criteria: [
          `${bc.name} 边界${verb}完成，相关模块依赖方向符合上下文映射`,
        ],
        evidence: bc.evidence,
        ddd_scope: { bounded_context: bc.name },
      });
      return {
        ...bc,
        linked_governance_actions: Array.from(
          new Set([...(bc.linked_governance_actions ?? []), action.id])
        ),
      };
    }
    return bc;
  });

  const context_map = (ddd.context_map ?? []).map((cm) => {
    if (cm.linked_governance_actions?.length) return cm;
    const needsAcl =
      cm.relationship === "anticorruption_layer" ||
      coerceToString(cm.current_problem).includes("跨") ||
      coerceToString(cm.recommendation).includes("防腐");
    if (!needsAcl) return cm;

    const title = `上下文集成治理：${cm.upstream_context} → ${cm.downstream_context}`;
    const action = ensureAction(title, {
      category: "ddd_integration",
      description: cm.recommendation,
      rationale: cm.current_problem ?? cm.recommendation,
      priority: "important",
      impact: "high",
      effort: "M",
      target_phase: "short",
      target_modules: coerceToStringArray(cm.integration_modules),
      prerequisites: [],
      acceptance_criteria: [
        `${cm.upstream_context} 与 ${cm.downstream_context} 之间通过 ${cm.relationship} 模式集成`,
      ],
      evidence: cm.evidence,
      ddd_scope: {
        bounded_context: cm.downstream_context,
        context_relationship: cm.relationship,
      },
    });
    return {
      ...cm,
      linked_governance_actions: [action.id],
    };
  });

  const modeling_gaps = (ddd.modeling_gaps ?? []).map((gap) => {
    if (gap.linked_governance_actions?.length) return gap;
    const title = `修复建模差距：${gap.title}`;
    const action = ensureAction(title, {
      category: gap.kind === "cross_context_leak" ? "ddd_integration" : "ddd_aggregate",
      description: gap.description,
      rationale: gap.description,
      priority: gap.kind === "cross_context_leak" ? "urgent" : "important",
      impact: "high",
      effort: "M",
      target_phase: "short",
      target_modules: [],
      prerequisites: [],
      acceptance_criteria: [`${gap.title} 差距消除，复扫 Issue 对应规则不再命中`],
      evidence: gap.evidence,
      ddd_scope: { bounded_context: gap.affected_contexts[0] },
    });
    return {
      ...gap,
      linked_governance_actions: [action.id],
    };
  });

  const aggregates = (ddd.aggregates ?? []).map((agg) => {
    const concerns = coerceToStringArray(agg.design_concerns);
    if (!concerns.length || agg.linked_governance_actions?.length) return agg;
    const title = `聚合重构：${agg.name}`;
    const action = ensureAction(title, {
      category: "ddd_aggregate",
      description: concerns.join("；"),
      rationale: agg.consistency_boundary_note,
      priority: "important",
      impact: "medium",
      effort: "M",
      target_phase: "mid",
      target_modules: [agg.aggregate_root.module_name],
      prerequisites: [],
      acceptance_criteria: [`${agg.name} 聚合边界收敛，不变量可测试验证`],
      evidence: agg.evidence,
      ddd_scope: { bounded_context: agg.bounded_context, aggregate: agg.name },
    });
    return {
      ...agg,
      linked_governance_actions: [action.id],
    };
  });

  return {
    ...content,
    ddd_governance: {
      ...ddd,
      bounded_contexts,
      context_map,
      modeling_gaps,
      aggregates,
    },
    governance_plan: {
      phases: content.governance_plan?.phases ?? [],
      actions,
      strategy_notes: content.governance_plan?.strategy_notes,
    },
  };
}

/** Link issues to governance actions via evidence and module overlap */
export function linkIssuesToGovernanceActions(
  content: AiReportContent,
  issues: ReportIssueInput[]
): AiReportContent {
  if (!content.governance_plan?.actions.length) return content;

  const actions = content.governance_plan.actions.map((action) => {
    const refs = new Set(collectActionEvidenceRefs(action));
    const modules = new Set(action.target_modules);

    const linked = new Set(action.linked_issues ?? []);
    for (const issue of issues) {
      const issueRef = `issue:${issue.id}`;
      const ruleRef = `rule:${issue.rule_id}`;
      if (refs.has(issueRef) || refs.has(ruleRef)) {
        linked.add(issueRef);
        continue;
      }
      if (issue.module_names?.some((m) => modules.has(m))) {
        linked.add(issueRef);
      }
    }
    return linked.size > 0 ? { ...action, linked_issues: Array.from(linked) } : action;
  });

  let ddd = content.ddd_governance;
  const crossLayerIssues = issues.filter(
    (i) => i.rule_id.includes("layer") || i.message.includes("层")
  );
  if (crossLayerIssues.length > 0 && ddd) {
    const hasLeakGap = ddd.modeling_gaps?.some((g) => g.kind === "cross_context_leak");
    if (!hasLeakGap) {
      const gap = {
        kind: "cross_context_leak" as const,
        title: "跨层/跨上下文依赖泄漏",
        description: `检测到 ${crossLayerIssues.length} 条与分层或边界相关的 Issue，领域模型或依赖可能跨限界上下文泄漏。`,
        affected_contexts: ddd.bounded_contexts.slice(0, 3).map((c) => c.name),
        evidence: crossLayerIssues.slice(0, 5).map((i) => ({
          ref: `issue:${i.id}`,
          label: i.message,
          kind: "fact" as const,
        })),
        linked_governance_actions: [] as string[],
      };
      ddd = {
        ...ddd,
        modeling_gaps: [...(ddd.modeling_gaps ?? []), gap],
      };
    }
  }

  return {
    ...content,
    ddd_governance: ddd,
    governance_plan: { ...content.governance_plan, actions },
  };
}

/** Build reverse index: issue ref -> governance actions */
export function buildIssueActionMap(
  content: AiReportContent
): Map<string, GovernanceAction[]> {
  const map = new Map<string, GovernanceAction[]>();
  for (const action of content.governance_plan?.actions ?? []) {
    for (const ref of action.linked_issues ?? []) {
      const list = map.get(ref) ?? [];
      list.push(action);
      map.set(ref, list);
    }
    for (const ref of collectActionEvidenceRefs(action)) {
      if (!ref.startsWith("issue:")) continue;
      const list = map.get(ref) ?? [];
      if (!list.some((a) => a.id === action.id)) list.push(action);
      map.set(ref, list);
    }
  }
  return map;
}
