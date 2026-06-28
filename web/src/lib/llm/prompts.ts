import type { AiReportContent } from "@/lib/types";

export function buildDiagnosisPrompt(input: {
  projectName: string;
  solutionPath: string;
  healthScore: number;
  issueCounts: Record<string, number>;
  topModules: Array<{ name: string; ce: number; ca: number; issueCount: number }>;
  issues: Array<{ id: string; rule_id: string; severity: string; message: string }>;
  metrics: Array<{ id: string; code: string; module_name: string | null; value: number }>;
  summaries: Array<{ module_name: string; top_types: string[]; snippet: string }>;
}): { system: string; user: string } {
  const system = `You are a senior .NET architect reviewing a MES system architecture.

Hard rules:
- Base conclusions ONLY on the provided metrics, issues, and summaries.
- Every risk and recommendation MUST include evidence_refs citing issue:id, metric:id, or rule:RULE_ID.
- Do not invent modules, classes, or dependencies not in the input.
- If evidence is insufficient, set insufficient_evidence true in summary context.
- Output valid JSON only.`;

  const user = `Analyze this .NET solution and produce an architecture diagnosis.

Project: ${input.projectName}
Solution: ${input.solutionPath}
Health Score: ${input.healthScore}/100
Issue counts: ${JSON.stringify(input.issueCounts)}

Top risk modules:
${JSON.stringify(input.topModules, null, 2)}

Issues (use id in evidence_refs as "issue:{id}"):
${JSON.stringify(input.issues.slice(0, 15), null, 2)}

Metrics (use id as "metric:{id}" or code as "metric_code:{code}"):
${JSON.stringify(input.metrics.slice(0, 30), null, 2)}

Module summaries:
${JSON.stringify(input.summaries.slice(0, 10), null, 2)}

Return JSON with this structure:
{
  "summary": "3-5 sentence overview",
  "risks": [{"title":"","severity":"critical|high|medium|low","description":"","evidence_refs":[]}],
  "quick_wins": [{"title":"","description":"","effort":"S|M|L","evidence_refs":[]}],
  "refactoring_recommendations": [{"title":"","category":"","description":"","effort":"S|M|L","evidence_refs":[],"module_name":""}],
  "strangler_candidates": [{"module_name":"","score":0,"rationale":"","evidence_refs":[]}]
}`;

  return { system, user };
}

export function reportToMarkdown(content: AiReportContent): string {
  const lines: string[] = [];
  lines.push("# Architecture Diagnosis Report\n");
  lines.push(`## Summary\n\n${content.summary}\n`);

  if (content.risks?.length) {
    lines.push("## Top Risks\n");
    for (const r of content.risks) {
      lines.push(`### ${r.title} (${r.severity})\n\n${r.description}\n`);
      lines.push(`Evidence: ${r.evidence_refs.join(", ")}\n`);
    }
  }

  if (content.quick_wins?.length) {
    lines.push("## Quick Wins\n");
    for (const q of content.quick_wins) {
      lines.push(`- **${q.title}** [${q.effort}]: ${q.description}`);
    }
    lines.push("");
  }

  if (content.refactoring_recommendations?.length) {
    lines.push("## Refactoring Recommendations\n");
    for (const rec of content.refactoring_recommendations) {
      lines.push(`### ${rec.title}\n\n**Category:** ${rec.category} | **Effort:** ${rec.effort}\n\n${rec.description}\n`);
    }
  }

  if (content.strangler_candidates?.length) {
    lines.push("## Strangler Candidates\n");
    for (const c of content.strangler_candidates) {
      lines.push(`- **${c.module_name}** (score: ${c.score}): ${c.rationale}`);
    }
  }

  return lines.join("\n");
}
