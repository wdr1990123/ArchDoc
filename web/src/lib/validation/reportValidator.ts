import type { AiReportContent } from "@/lib/types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateReport(
  content: AiReportContent,
  evidenceIndex: Map<string, boolean>
): ValidationResult {
  const errors: string[] = [];

  const checkRefs = (refs: string[] | undefined, context: string) => {
    for (const ref of refs ?? []) {
      if (!evidenceIndex.has(ref)) {
        const altKeys = Array.from(evidenceIndex.keys()).filter((k) =>
          ref.includes(k.split(":")[1] ?? "")
        );
        if (altKeys.length === 0) {
          errors.push(`${context}: invalid evidence_ref "${ref}"`);
        }
      }
    }
  };

  for (const risk of content.risks ?? []) {
    checkRefs(risk.evidence_refs, `risk "${risk.title}"`);
  }
  for (const win of content.quick_wins ?? []) {
    checkRefs(win.evidence_refs, `quick_win "${win.title}"`);
  }
  for (const rec of content.refactoring_recommendations ?? []) {
    checkRefs(rec.evidence_refs, `recommendation "${rec.title}"`);
  }

  if (!content.summary?.trim()) {
    errors.push("summary is empty");
  }

  return { valid: errors.length === 0, errors };
}

export function parseReportJson(raw: string): AiReportContent {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as AiReportContent;
}
