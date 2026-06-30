import type { AiReportContent, ModuleRoleEntry } from "@/lib/types";
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

/** Normalize module_roles from LLM batch JSON (handles module/name aliases). */
export function extractModuleRolesFromLlmJson(parsed: AiReportContent): ModuleRoleEntry[] {
  return sanitizeModuleRoles((parsed.module_roles ?? []) as ModuleRoleEntry[], undefined);
}
