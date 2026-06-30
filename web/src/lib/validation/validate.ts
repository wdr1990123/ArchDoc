import type {
  AiReportContent,
  EvidenceItem,
  ModuleRoleEntry,
} from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";
import { coerceToString } from "./coerce";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
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
