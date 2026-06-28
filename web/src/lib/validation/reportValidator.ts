import type {
  AiReportContent,
  DesignHypothesis,
  EvidenceItem,
  ModuleRoleEntry,
} from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** LLM JSON may return non-string text fields (arrays/objects); coerce safely before .trim(). */
export function coerceToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => coerceToString(item)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.description === "string") return record.description;
    return JSON.stringify(value);
  }
  return String(value);
}

/** Coerce LLM output to string[] (handles bare strings and null). */
export function coerceToStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => coerceToString(item)).filter(Boolean);
  }
  const single = coerceToString(value).trim();
  return single ? [single] : [];
}

const EFFORT_VALUES = new Set(["S", "M", "L"]);

/** Coerce LLM effort to S|M|L (DB NOT NULL). */
export function normalizeEffort(value: unknown): "S" | "M" | "L" {
  const s = coerceToString(value).trim().toUpperCase();
  if (EFFORT_VALUES.has(s)) return s as "S" | "M" | "L";
  if (/小|低|SMALL|XS/.test(s)) return "S";
  if (/大|高|LARGE|XL/.test(s)) return "L";
  return "M";
}

export function sanitizeRefactoringRecommendations(
  recs: AiReportContent["refactoring_recommendations"]
): NonNullable<AiReportContent["refactoring_recommendations"]> {
  return (recs ?? [])
    .map((rec) => ({
      ...rec,
      title: coerceToString(rec.title).trim(),
      category: coerceToString(rec.category).trim() || "general",
      description: coerceToString(rec.description).trim(),
      effort: normalizeEffort(rec.effort),
    }))
    .filter((rec) => rec.title.length > 0 && rec.description.length > 0);
}

export function sanitizeQuickWins(
  wins: AiReportContent["quick_wins"]
): AiReportContent["quick_wins"] {
  return (wins ?? [])
    .map((win) => ({
      ...win,
      title: coerceToString(win.title).trim(),
      description: coerceToString(win.description).trim(),
      effort: normalizeEffort(win.effort),
    }))
    .filter((win) => win.title.length > 0 && win.description.length > 0);
}

function normalizeModuleRole(raw: ModuleRoleEntry): ModuleRoleEntry {
  const role = raw as ModuleRoleEntry & { module?: string; name?: string };
  return {
    ...role,
    module_name: coerceToString(role.module_name ?? role.module ?? role.name).trim(),
    layer: coerceToString(role.layer),
    responsibility_hypothesis: coerceToString(role.responsibility_hypothesis).trim(),
    key_types: Array.isArray(role.key_types)
      ? role.key_types.map((t) => coerceToString(t)).filter(Boolean)
      : [],
  };
}

/** Normalize module_roles from LLM batch JSON (handles module/name aliases). */
export function extractModuleRolesFromLlmJson(parsed: AiReportContent): ModuleRoleEntry[] {
  return sanitizeModuleRoles((parsed.module_roles ?? []) as ModuleRoleEntry[], undefined);
}

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
export function sanitizeModuleRoles(
  roles: ModuleRoleEntry[] | undefined,
  structure?: StructureFacts
): ModuleRoleEntry[] {
  const expected = structure ? new Set(structure.modules.map((m) => m.name)) : null;
  const byName = new Map<string, ModuleRoleEntry>();

  for (const raw of roles ?? []) {
    const role = normalizeModuleRole(raw);
    if (!role.module_name) continue;
    if (expected && !expected.has(role.module_name)) continue;
    byName.set(role.module_name, role);
  }

  return Array.from(byName.values());
}

function collectEvidenceRefs(content: AiReportContent): Array<{ refs: string[]; context: string }> {
  const groups: Array<{ refs: string[]; context: string }> = [];

  const fromItems = (items: EvidenceItem[] | undefined, legacy: string[] | undefined) => {
    const refs = [...(items?.map((e) => e.ref) ?? []), ...(legacy ?? [])];
    return refs;
  };

  for (const risk of content.risks ?? []) {
    groups.push({
      refs: fromItems(risk.evidence, risk.evidence_refs),
      context: `risk "${risk.title}"`,
    });
  }
  for (const win of content.quick_wins ?? []) {
    groups.push({
      refs: fromItems(win.evidence, win.evidence_refs),
      context: `quick_win "${win.title}"`,
    });
  }
  for (const rec of content.refactoring_recommendations ?? []) {
    groups.push({
      refs: fromItems(rec.evidence, rec.evidence_refs),
      context: `recommendation "${rec.title}"`,
    });
  }
  for (const chain of content.key_dependency_chains ?? []) {
    groups.push({
      refs: fromItems(chain.evidence, undefined),
      context: "key_dependency_chain",
    });
  }
  for (const role of content.module_roles ?? []) {
    groups.push({
      refs: fromItems(role.evidence, undefined),
      context: `module_role "${role.module_name}"`,
    });
  }
  for (const item of content.issue_interpretations ?? []) {
    groups.push({
      refs: fromItems(item.evidence, undefined),
      context: `issue_interpretation "${item.issue_ref}"`,
    });
  }

  const intent = content.module_intent;
  if (intent) {
    groups.push({
      refs: fromItems(intent.evidence, undefined),
      context: `module_intent "${intent.module_name}"`,
    });
    for (const wf of intent.key_workflows ?? []) {
      groups.push({
        refs: fromItems(wf.evidence, undefined),
        context: `workflow "${wf.name}"`,
      });
    }
    for (const iface of intent.external_interfaces ?? []) {
      groups.push({
        refs: fromItems(iface.evidence, undefined),
        context: `interface "${iface.name}"`,
      });
    }
  }

  for (const action of content.governance_plan?.actions ?? []) {
    groups.push({
      refs: fromItems(action.evidence, action.evidence_refs),
      context: `governance_action "${action.id}"`,
    });
  }

  for (const bc of content.ddd_governance?.bounded_contexts ?? []) {
    groups.push({
      refs: fromItems(bc.evidence, undefined),
      context: `bounded_context "${bc.name}"`,
    });
  }
  for (const cm of content.ddd_governance?.context_map ?? []) {
    groups.push({
      refs: fromItems(cm.evidence, undefined),
      context: `context_map "${cm.upstream_context}->${cm.downstream_context}"`,
    });
  }
  for (const agg of content.ddd_governance?.aggregates ?? []) {
    groups.push({
      refs: [agg.aggregate_root.ref, ...(agg.evidence?.map((e) => e.ref) ?? [])],
      context: `aggregate "${agg.name}"`,
    });
  }
  for (const gap of content.ddd_governance?.modeling_gaps ?? []) {
    groups.push({
      refs: fromItems(gap.evidence, undefined),
      context: `modeling_gap "${gap.title}"`,
    });
  }
  for (const sub of content.ddd_governance?.subdomain_landscape ?? []) {
    groups.push({
      refs: fromItems(sub.evidence, undefined),
      context: `subdomain "${sub.name}"`,
    });
  }

  const dddProfile = content.module_ddd_profile;
  if (dddProfile) {
    for (const cand of dddProfile.aggregate_candidates ?? []) {
      groups.push({
        refs: [cand.ref, ...(cand.evidence?.map((e) => e.ref) ?? [])],
        context: `aggregate_candidate "${cand.type_name}"`,
      });
    }
  }

  return groups;
}

export function validateReport(
  content: AiReportContent,
  evidenceIndex: Map<string, boolean>,
  issueCount: number,
  options?: {
    publicTypeNames?: Set<string>;
    moduleReport?: boolean;
    structure?: StructureFacts;
  }
): ValidationResult {
  const errors: string[] = [];

  const checkRefs = (refs: string[], context: string) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (!evidenceIndex.has(ref)) {
        errors.push(`${context}: invalid evidence_ref "${ref}"`);
      }
    }
  };

  for (const group of collectEvidenceRefs(content)) {
    checkRefs(group.refs, group.context);
  }

  if (!coerceToString(content.summary).trim()) {
    errors.push("summary is empty");
  }

  if (issueCount === 0) {
    const criticalRisks = (content.risks ?? []).filter((r) => r.severity === "critical");
    for (const risk of criticalRisks) {
      const refs = [
        ...(risk.evidence?.map((e) => e.ref) ?? []),
        ...(risk.evidence_refs ?? []),
      ];
      const hasFactEvidence = refs.some(
        (ref) =>
          ref.startsWith("issue:") ||
          ref.startsWith("dep:") ||
          ref.startsWith("metric:") ||
          ref.startsWith("rule:")
      );
      if (!hasFactEvidence) {
        errors.push(`risk "${risk.title}": critical risk without fact evidence when issue_count is 0`);
      }
    }
  }

  for (const role of content.module_roles ?? []) {
    if (role.confidence && !coerceToString(role.responsibility_hypothesis).trim()) {
      errors.push(`module_role "${role.module_name}": missing responsibility_hypothesis`);
    }
  }

  const intent = content.module_intent;
  if (intent) {
    if (!coerceToString(intent.purpose).trim()) {
      errors.push(`module_intent "${intent.module_name}": missing purpose`);
    }
    if ((intent.business_capabilities?.length ?? 0) < 2) {
      errors.push(`module_intent "${intent.module_name}": need at least 2 business_capabilities`);
    }
    if ((intent.core_entities?.length ?? 0) < 2) {
      errors.push(`module_intent "${intent.module_name}": need at least 2 core_entities`);
    }
    if ((intent.key_workflows?.length ?? 0) < 1) {
      errors.push(`module_intent "${intent.module_name}": need at least 1 key_workflow`);
    }
    const knownTypes = options?.publicTypeNames;
    if (knownTypes && knownTypes.size > 0 && intent.external_interfaces?.length) {
      for (const iface of intent.external_interfaces) {
        const shortName = iface.name.includes(".")
          ? iface.name.split(".").pop()!
          : iface.name;
        if (!knownTypes.has(shortName) && !knownTypes.has(iface.name)) {
          errors.push(
            `interface "${iface.name}": not found in public_surface (expected one of scanned public types)`
          );
        }
      }
    }
  } else if (options?.moduleReport) {
    errors.push("module report missing module_intent");
  }

  if (options?.moduleReport && content.module_ddd_profile) {
    for (const cand of content.module_ddd_profile.aggregate_candidates ?? []) {
      if (!evidenceIndex.has(cand.ref)) {
        errors.push(`aggregate_candidate "${cand.type_name}": ref "${cand.ref}" not in evidence index`);
      }
    }
  }

  if (!options?.moduleReport && options?.structure) {
    const structure = options.structure;
    const expectedNames = new Set(structure.modules.map((m) => m.name));
    const roleNames = new Set((content.module_roles ?? []).map((r) => r.module_name));

    if ((content.module_roles?.length ?? 0) !== structure.total_modules) {
      errors.push(
        `module_roles count ${content.module_roles?.length ?? 0} != total_modules ${structure.total_modules}`
      );
    }
    for (const name of Array.from(expectedNames)) {
      if (!roleNames.has(name)) {
        errors.push(`module_roles missing module "${name}"`);
      }
    }
    for (const name of Array.from(roleNames)) {
      if (!expectedNames.has(name)) {
        errors.push(`module_roles unknown module "${name}"`);
      }
    }

    if ((content.design_hypotheses?.length ?? 0) < 1) {
      errors.push("design_hypotheses must have at least 1 entry");
    }

    if (
      (content.strangler_candidates?.length ?? 0) > 0 &&
      (content.strangler_roadmap?.length ?? 0) < 1
    ) {
      errors.push("strangler_roadmap required when strangler_candidates present");
    }

    if (issueCount > 0) {
      if ((content.issue_interpretations?.length ?? 0) !== issueCount) {
        errors.push(
          `issue_interpretations count ${content.issue_interpretations?.length ?? 0} != issue_count ${issueCount}`
        );
      }
      for (const item of content.issue_interpretations ?? []) {
        if (!coerceToString(item.interpretation).trim()) {
          errors.push(`issue_interpretation "${item.issue_ref}": missing interpretation`);
        }
      }
    }

    const govActions = content.governance_plan?.actions ?? [];
    if (govActions.length < 3) {
      errors.push(`governance_plan.actions must have at least 3 entries (got ${govActions.length})`);
    }
    for (const action of govActions) {
      if ((action.acceptance_criteria?.length ?? 0) < 1) {
        errors.push(`governance_action "${action.id}": missing acceptance_criteria`);
      }
    }

    const boundedContexts = content.ddd_governance?.bounded_contexts ?? [];
    if (boundedContexts.length < 2) {
      errors.push(`ddd_governance.bounded_contexts must have at least 2 entries (got ${boundedContexts.length})`);
    }

    for (const agg of content.ddd_governance?.aggregates ?? []) {
      if (!evidenceIndex.has(agg.aggregate_root.ref)) {
        errors.push(
          `aggregate "${agg.name}": aggregate_root ref "${agg.aggregate_root.ref}" not in evidence index`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isParseTruncationError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return isMalformedOrTruncatedJsonMessage(msg);
}

function isMalformedOrTruncatedJsonMessage(msg: string): boolean {
  return (
    msg.includes("max_tokens 截断") ||
    msg.includes("Unterminated") ||
    msg.includes("Unexpected end") ||
    msg.includes("Expected ',' or ']' after array element") ||
    msg.includes("Expected ',' or '}' after property") ||
    msg.includes("Expected property name") ||
    msg.includes("Unexpected token") ||
    msg.includes("JSON 解析失败")
  );
}

export function parseReportJson(raw: string): AiReportContent {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonStr =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  try {
    return JSON.parse(jsonStr) as AiReportContent;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Invalid JSON";
    const likelyTruncated =
      isMalformedOrTruncatedJsonMessage(msg) ||
      (jsonStr.length >= 3800 && !jsonStr.trimEnd().endsWith("}"));
    if (likelyTruncated) {
      throw new Error(
        `${msg}（Report V2 输出较长或格式不完整，响应可能被 max_tokens 截断。系统将自动紧凑重试并分批生成模块职责；若仍失败请换用更快模型）`
      );
    }
    throw error instanceof Error ? error : new Error(msg);
  }
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
