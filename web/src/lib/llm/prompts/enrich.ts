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

export function enrichReportContent(
  content: AiReportContent,
  structure: StructureFacts,
  healthScore: number,
  issues: ReportIssueInput[] = []
): AiReportContent {
  const key_dependency_chains = structure.key_dependency_chains.map((chain) => ({
    path: chain.path,
    reason: chain.reason,
    evidence: [
      {
        ref: chain.ref,
        label: chain.path.length ? chain.path.join(" → ") : chain.reason,
        kind: "fact" as const,
      },
    ],
  }));

  const llmByRef = new Map(
    (content.issue_interpretations ?? []).map((item) => [item.issue_ref, item])
  );

  const issue_interpretations: IssueInterpretation[] = issues.map((issue) => {
    const issue_ref = `issue:${issue.id}`;
    const llm = llmByRef.get(issue_ref);
    return {
      issue_ref,
      rule_id: issue.rule_id,
      severity: issue.severity,
      message: issue.message,
      module_names: issue.module_names,
      interpretation: llm?.interpretation?.trim() || issue.message,
      evidence:
        llm?.evidence ??
        [
          {
            ref: issue_ref,
            label: issue.message,
            kind: "fact" as const,
          },
        ],
    };
  });

  const merged = {
    ...content,
    report_version: "2.1" as const,
    architecture_overview: {
      module_count: structure.total_modules,
      total_loc: structure.total_loc,
      health_score: healthScore,
      layer_distribution: structure.layer_distribution,
      issue_count: structure.issue_count,
    },
    key_dependency_chains,
    issue_interpretations,
  };

  return syncEvidenceRefs(
    normalizeReportEvidenceRefs(ensureDesignHypotheses(merged, structure), structure)
  );
}

/** Merge module_roles from a batch response into existing content */
export function mergeModuleRoles(
  content: AiReportContent,
  batchRoles: ModuleRoleEntry[],
  structure?: StructureFacts
): AiReportContent {
  const byName = new Map(
    (content.module_roles ?? []).map((r) => [r.module_name, r])
  );
  for (const role of batchRoles) {
    const name = typeof role.module_name === "string" ? role.module_name.trim() : "";
    if (!name) continue;
    if (structure && !structure.modules.some((m) => m.name === name)) continue;
    byName.set(name, role);
  }
  return {
    ...content,
    module_roles: Array.from(byName.values()),
  };
}

export function getMissingModuleNames(
  content: AiReportContent,
  structure: StructureFacts
): string[] {
  const covered = new Set((content.module_roles ?? []).map((r) => r.module_name));
  return structure.modules.map((m) => m.name).filter((name) => !covered.has(name));
}

