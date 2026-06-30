import type {
  AiReportContent,
  DesignHypothesis,
  EvidenceItem,
  ModuleRoleEntry,
} from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";
import { coerceToStringArray } from "./coerce";
import { sanitizeModuleRoles } from "./coerce";

const STRUCTURE_REF_ALIASES = new Set([
  "structure",
  "layer_analysis",
  "layer_distribution",
  "architecture",
  "architecture_overview",
]);

/** Map LLM-invented refs to registered evidence keys. */
export function normalizeEvidenceRef(
  ref: string,
  structure?: StructureFacts,
  moduleName?: string
): string {
  const r = ref.trim();
  if (!r) return r;

  const typePrefix = "type:";
  if (r.startsWith(typePrefix)) {
    const typeName = r.slice(typePrefix.length);
    if (typeName && !typeName.includes(":") && moduleName) {
      return `${typePrefix}${moduleName}:${typeName}`;
    }
    return r;
  }

  if (
    /^(issue|metric|dep|module|package|rule|structure|module_id|metric_code):/.test(r)
  ) {
    return r;
  }
  const lower = r.toLowerCase();
  if (STRUCTURE_REF_ALIASES.has(lower)) return "structure";
  if (/^architecture:/.test(lower)) return "structure";
  if (/^layer(_|:)/.test(lower)) return "structure";
  if (structure?.modules.some((m) => m.name === r)) return `module:${r}`;
  return r;
}

function normalizeRefList(
  refs: string[] | undefined,
  structure?: StructureFacts,
  moduleName?: string
): string[] | undefined {
  if (!refs?.length) return refs;
  return refs.map((ref) => normalizeEvidenceRef(ref, structure, moduleName));
}

function normalizeEvidenceItems(
  items: EvidenceItem[] | undefined,
  structure?: StructureFacts,
  moduleName?: string
): EvidenceItem[] | undefined {
  if (!items?.length) return items;
  return items.map((e) => ({
    ...e,
    ref: normalizeEvidenceRef(e.ref, structure, moduleName),
  }));
}

function mapEvidenceSection<
  T extends { evidence?: EvidenceItem[]; evidence_refs?: string[] },
>(item: T, structure?: StructureFacts): T {
  return {
    ...item,
    evidence: normalizeEvidenceItems(item.evidence, structure),
    evidence_refs: normalizeRefList(item.evidence_refs, structure),
  };
}

/** Fill design_hypotheses when LLM omits the required section. */
export function ensureDesignHypotheses(
  content: AiReportContent,
  structure: StructureFacts
): AiReportContent {
  if ((content.design_hypotheses?.length ?? 0) > 0) return content;

  const layers = Object.entries(structure.layer_distribution)
    .filter(([, names]) => names.length > 0)
    .map(([layer, names]) => `${layer}(${names.length})`);
  const unknownCount = structure.layer_distribution.unknown?.length ?? 0;
  const sampleModules = structure.modules.slice(0, 3).map((m) => `module:${m.name}`);

  const hypothesis: DesignHypothesis = {
    title: "整体分层与模块组织",
    description:
      `基于扫描结构事实，共 ${structure.total_modules} 个模块、` +
      `${structure.total_loc} LOC，分层分布：${layers.join("、") || "未识别"}。` +
      (unknownCount > 0
        ? `其中 ${unknownCount} 个模块分层标识不明确，需结合命名与依赖进一步确认设计意图。`
        : "模块分层与命名模式相对一致。"),
    confidence:
      unknownCount > Math.max(1, Math.floor(structure.total_modules * 0.25))
        ? "low"
        : "medium",
    based_on_refs: ["structure", ...sampleModules],
  };

  return { ...content, design_hypotheses: [hypothesis] };
}

/** Rewrite common LLM evidence ref mistakes before validation. */
export function normalizeReportEvidenceRefs(
  content: AiReportContent,
  structure?: StructureFacts
): AiReportContent {
  return {
    ...content,
    risks: (content.risks ?? []).map((r) => mapEvidenceSection(r, structure)),
    quick_wins: (content.quick_wins ?? []).map((w) => mapEvidenceSection(w, structure)),
    refactoring_recommendations: (content.refactoring_recommendations ?? []).map((rec) =>
      mapEvidenceSection(rec, structure)
    ),
    design_hypotheses: (content.design_hypotheses ?? []).map((h) => ({
      ...h,
      based_on_refs: normalizeRefList(h.based_on_refs, structure) ?? [],
    })),
    strangler_candidates: (content.strangler_candidates ?? []).map((c) =>
      mapEvidenceSection(c, structure)
    ),
    strangler_roadmap: (content.strangler_roadmap ?? []).map((step) =>
      mapEvidenceSection(step, structure)
    ),
    module_roles: (content.module_roles ?? []).map((role) => ({
      ...role,
      evidence: normalizeEvidenceItems(role.evidence, structure, role.module_name),
    })) as ModuleRoleEntry[],
    executive_summary: content.executive_summary,
    governance_plan: content.governance_plan
      ? {
          ...content.governance_plan,
          phases: (content.governance_plan.phases ?? []).map((phase) => ({
            ...phase,
            objectives: coerceToStringArray(phase.objectives),
            success_metrics: coerceToStringArray(phase.success_metrics),
          })),
          actions: (content.governance_plan.actions ?? []).map((a) => ({
            ...mapEvidenceSection(a, structure),
            target_modules: coerceToStringArray(a.target_modules),
            prerequisites: coerceToStringArray(a.prerequisites),
            acceptance_criteria: coerceToStringArray(a.acceptance_criteria),
          })),
        }
      : undefined,
    ddd_governance: content.ddd_governance
      ? {
          ...content.ddd_governance,
          subdomain_landscape: (content.ddd_governance.subdomain_landscape ?? []).map((s) => ({
            ...s,
            related_modules: coerceToStringArray(s.related_modules),
            evidence: normalizeEvidenceItems(s.evidence, structure) ?? [],
          })),
          bounded_contexts: (content.ddd_governance.bounded_contexts ?? []).map((bc) => ({
            ...bc,
            modules: coerceToStringArray(bc.modules),
            namespace_hints: coerceToStringArray(bc.namespace_hints),
            ubiquitous_language: coerceToStringArray(bc.ubiquitous_language),
            linked_governance_actions: coerceToStringArray(bc.linked_governance_actions),
            evidence: normalizeEvidenceItems(bc.evidence, structure) ?? [],
          })),
          context_map: (content.ddd_governance.context_map ?? []).map((cm) => ({
            ...cm,
            integration_modules: coerceToStringArray(cm.integration_modules),
            linked_governance_actions: coerceToStringArray(cm.linked_governance_actions),
            evidence: normalizeEvidenceItems(cm.evidence, structure) ?? [],
          })),
          aggregates: (content.ddd_governance.aggregates ?? []).map((agg) => ({
            ...agg,
            entities: coerceToStringArray(agg.entities),
            value_objects: coerceToStringArray(agg.value_objects),
            invariants: coerceToStringArray(agg.invariants),
            design_concerns: coerceToStringArray(agg.design_concerns),
            linked_governance_actions: coerceToStringArray(agg.linked_governance_actions),
            aggregate_root: {
              ...agg.aggregate_root,
              ref: normalizeEvidenceRef(
                agg.aggregate_root?.ref ?? "",
                structure,
                agg.aggregate_root?.module_name
              ),
            },
            evidence:
              normalizeEvidenceItems(agg.evidence, structure, agg.aggregate_root?.module_name) ??
              [],
          })),
          modeling_gaps: (content.ddd_governance.modeling_gaps ?? []).map((g) => ({
            ...g,
            affected_contexts: coerceToStringArray(g.affected_contexts),
            linked_governance_actions: coerceToStringArray(g.linked_governance_actions),
            evidence: normalizeEvidenceItems(g.evidence, structure) ?? [],
          })),
        }
      : undefined,
    module_ddd_profile: content.module_ddd_profile
      ? {
          ...content.module_ddd_profile,
          aggregate_candidates: content.module_ddd_profile.aggregate_candidates.map((c) => ({
            ...c,
            ref: normalizeEvidenceRef(c.ref, structure, content.module_intent?.module_name),
            evidence: normalizeEvidenceItems(c.evidence, structure, content.module_intent?.module_name) ?? [],
          })),
        }
      : undefined,
  };
}

/** Sync legacy evidence_refs from structured evidence arrays */
export function syncEvidenceRefs(content: AiReportContent): AiReportContent {
  const sync = <T extends { evidence?: EvidenceItem[]; evidence_refs?: string[] }>(item: T) => {
    if (item.evidence?.length) {
      item.evidence_refs = item.evidence.map((e) => e.ref);
    }
    return item;
  };

  content.risks = (content.risks ?? []).map(sync);
  content.quick_wins = (content.quick_wins ?? []).map(sync);
  content.refactoring_recommendations = (content.refactoring_recommendations ?? []).map(sync);
  content.strangler_candidates = (content.strangler_candidates ?? []).map(sync);
  if (content.module_intent) {
    content.module_intent.evidence = content.module_intent.evidence?.map((e) => e);
    for (const wf of content.module_intent.key_workflows ?? []) {
      sync(wf);
    }
    for (const iface of content.module_intent.external_interfaces ?? []) {
      sync(iface);
    }
  }
  for (const step of content.strangler_roadmap ?? []) {
    sync(step);
  }
  for (const action of content.governance_plan?.actions ?? []) {
    sync(action);
  }
  if (content.issue_interpretations) {
    content.issue_interpretations = content.issue_interpretations.map((item) => {
      if (item.evidence?.length) {
        return item;
      }
      return item;
    });
  }
  content.module_roles = sanitizeModuleRoles(content.module_roles as ModuleRoleEntry[]);
  return content;
}
