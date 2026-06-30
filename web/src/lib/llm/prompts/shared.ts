import type { StructureFacts, StructureModuleFact } from "@/lib/metrics/structureFacts";

export const MODULE_BATCH_THRESHOLD = 25;
export const MODULE_BATCH_SIZE = 5;
/** Defer module_roles to batched follow-up calls to avoid huge single responses */
export const MODULE_ROLES_SPLIT_THRESHOLD = 10;

export const DEPENDENCY_PROMPT_CAP = 80;
export const METRICS_PROMPT_CAP = 120;

export interface ReportIssueInput {
  id: string;
  rule_id: string;
  severity: string;
  message: string;
  module_names?: string[];
}

export function compactModulesForPrompt(modules: StructureModuleFact[]) {
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

export function compactStructureForPrompt(structure: StructureFacts) {
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

export function summarizeDeepFacts(
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
