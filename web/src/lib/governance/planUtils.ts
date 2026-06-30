import type { GovernanceAction } from "@/lib/types";
import { normalizeEffort, coerceToString, coerceToStringArray } from "@/lib/validation/reportValidator";

export function nextActionId(index: number): string {
  return `GA-${String(index).padStart(3, "0")}`;
}

export function sanitizeGovernanceAction(
  raw: GovernanceAction,
  fallbackIndex: number
): GovernanceAction | null {
  const title = coerceToString(raw.title).trim();
  if (!title) return null;
  const description = coerceToString(raw.description).trim() || title;
  return {
    ...raw,
    id: coerceToString(raw.id).trim() || nextActionId(fallbackIndex),
    title,
    description,
    rationale: coerceToString(raw.rationale).trim() || description,
    target_modules: coerceToStringArray(raw.target_modules),
    prerequisites: coerceToStringArray(raw.prerequisites),
    acceptance_criteria: coerceToStringArray(raw.acceptance_criteria),
    linked_issues: coerceToStringArray(raw.linked_issues),
    linked_actions: coerceToStringArray(raw.linked_actions),
    effort: normalizeEffort(raw.effort),
  };
}

export function collectActionEvidenceRefs(action: GovernanceAction): string[] {
  return [
    ...(action.evidence?.map((e) => e.ref) ?? []),
    ...(action.evidence_refs ?? []),
  ];
}
