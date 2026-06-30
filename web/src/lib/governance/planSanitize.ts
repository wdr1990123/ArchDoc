import type { AiReportContent } from "@/lib/types";
import { coerceToString, coerceToStringArray } from "@/lib/validation/reportValidator";
import { sanitizeGovernanceAction } from "@/lib/governance/planUtils";

/** Normalize LLM governance shapes before .join() / .map() (strings → arrays). */
export function sanitizeGovernanceContent(content: AiReportContent): AiReportContent {
  const result = { ...content };

  if (result.executive_summary) {
    result.executive_summary = {
      ...result.executive_summary,
      defer_items: coerceToStringArray(result.executive_summary.defer_items),
    };
  }

  if (result.governance_plan) {
    const plan = result.governance_plan;
    result.governance_plan = {
      ...plan,
      phases: (plan.phases ?? []).map((phase) => ({
        ...phase,
        title: coerceToString(phase.title).trim() || "治理阶段",
        objectives: coerceToStringArray(phase.objectives),
        success_metrics: coerceToStringArray(phase.success_metrics),
      })),
      actions: (plan.actions ?? [])
        .map((action, index) => sanitizeGovernanceAction(action, index + 1))
        .filter((action): action is GovernanceAction => action !== null),
    };
  }

  if (result.ddd_governance) {
    const ddd = result.ddd_governance;
    result.ddd_governance = {
      ...ddd,
      subdomain_landscape: (ddd.subdomain_landscape ?? []).map((sub) => ({
        ...sub,
        related_modules: coerceToStringArray(sub.related_modules),
      })),
      bounded_contexts: (ddd.bounded_contexts ?? []).map((bc) => ({
        ...bc,
        modules: coerceToStringArray(bc.modules),
        namespace_hints: coerceToStringArray(bc.namespace_hints),
        ubiquitous_language: coerceToStringArray(bc.ubiquitous_language),
        linked_governance_actions: coerceToStringArray(bc.linked_governance_actions),
      })),
      context_map: (ddd.context_map ?? []).map((cm) => ({
        ...cm,
        recommendation: coerceToString(cm.recommendation),
        current_problem: coerceToString(cm.current_problem),
        integration_modules: coerceToStringArray(cm.integration_modules),
        linked_governance_actions: coerceToStringArray(cm.linked_governance_actions),
      })),
      aggregates: (ddd.aggregates ?? []).map((agg) => ({
        ...agg,
        entities: coerceToStringArray(agg.entities),
        value_objects: coerceToStringArray(agg.value_objects),
        invariants: coerceToStringArray(agg.invariants),
        design_concerns: coerceToStringArray(agg.design_concerns),
        linked_governance_actions: coerceToStringArray(agg.linked_governance_actions),
      })),
      modeling_gaps: (ddd.modeling_gaps ?? []).map((gap) => ({
        ...gap,
        affected_contexts: coerceToStringArray(gap.affected_contexts),
        linked_governance_actions: coerceToStringArray(gap.linked_governance_actions),
      })),
    };
  }

  if (result.module_ddd_profile) {
    result.module_ddd_profile = {
      ...result.module_ddd_profile,
      boundary_recommendations: coerceToStringArray(
        result.module_ddd_profile.boundary_recommendations
      ),
    };
  }

  return result;
}
