import type { AiReportContent } from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";
import type { ReportIssueInput } from "@/lib/llm/prompts";
import {
  buildGovernancePlan,
  ensureDddGovernance,
  ensureExecutiveSummary,
} from "@/lib/governance/planBuilder";
import {
  buildIssueActionMap,
  linkDddToGovernanceActions,
  linkIssuesToGovernanceActions,
} from "@/lib/governance/planLinks";
import { sanitizeGovernanceContent } from "@/lib/governance/planSanitize";
import { enrichDddFromModuleRollup, type ModuleIntentRollupEntry } from "@/lib/governance/moduleIntentRollup";

export function finalizeGovernanceContent(
  content: AiReportContent,
  structure: StructureFacts,
  healthScore: number,
  issueCount: number,
  projectReport: boolean,
  options?: {
    moduleRollup?: ModuleIntentRollupEntry[];
    issues?: ReportIssueInput[];
  }
): AiReportContent {
  let result = sanitizeGovernanceContent(content);

  if (projectReport && options?.moduleRollup?.length) {
    result = enrichDddFromModuleRollup(result, options.moduleRollup);
  }

  result = buildGovernancePlan(result, structure, healthScore);

  if (projectReport) {
    result = ensureDddGovernance(result, structure);
  }

  if (projectReport && options?.moduleRollup?.length) {
    result = enrichDddFromModuleRollup(result, options.moduleRollup);
  }

  result = linkDddToGovernanceActions(result, structure, healthScore);

  if (options?.issues?.length) {
    result = linkIssuesToGovernanceActions(result, options.issues);
    result = linkDddToGovernanceActions(result, structure, healthScore);
  }

  result = buildGovernancePlan(result, structure, healthScore);
  result = ensureExecutiveSummary(result, healthScore, issueCount);

  return {
    ...result,
    report_version: "2.1",
  };
}
