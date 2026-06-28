import { coerceToStringArray } from "@/lib/validation/reportValidator";
import type { AiReportContent, ModuleIntentDetail } from "@/lib/types";

export interface ModuleIntentRollupEntry {
  module_name: string;
  purpose: string;
  business_capabilities: string[];
  core_entities: string[];
  bounded_context?: string;
  context_role?: string;
  aggregate_candidates: Array<{ type_name: string; role: string; ref: string }>;
  boundary_recommendations: string[];
}

/** Load latest module report intents for project-level rollup */
export async function loadModuleIntentRollup(
  scanRunId: string
): Promise<ModuleIntentRollupEntry[]> {
  const rows = await query<{ content: AiReportContent | string }>(
    `SELECT content FROM diagnostic_reports
     WHERE scan_run_id = $1 AND report_type = 'module' AND status IN ('completed', 'partial')
     ORDER BY created_at DESC`,
    [scanRunId]
  );

  const seen = new Set<string>();
  const rollup: ModuleIntentRollupEntry[] = [];

  for (const row of rows) {
    let content = row.content;
    if (typeof content === "string") {
      try {
        content = JSON.parse(content) as AiReportContent;
      } catch {
        continue;
      }
    }
    const intent = content?.module_intent;
    if (!intent?.module_name || seen.has(intent.module_name)) continue;
    seen.add(intent.module_name);

    const profile = content?.module_ddd_profile;
    rollup.push({
      module_name: intent.module_name,
      purpose: intent.purpose,
      business_capabilities: intent.business_capabilities ?? [],
      core_entities: intent.core_entities ?? [],
      bounded_context: profile?.bounded_context_membership?.context_name,
      context_role: profile?.bounded_context_membership?.role_in_context,
      aggregate_candidates: (profile?.aggregate_candidates ?? []).map((c) => ({
        type_name: c.type_name,
        role: c.role,
        ref: c.ref,
      })),
      boundary_recommendations: profile?.boundary_recommendations ?? [],
    });
  }

  return rollup;
}

export function compactModuleIntentRollupForPrompt(rollup: ModuleIntentRollupEntry[]) {
  return rollup.map((e) => ({
    module_name: e.module_name,
    purpose: e.purpose.slice(0, 200),
    business_capabilities: e.business_capabilities.slice(0, 6),
    core_entities: e.core_entities.slice(0, 8),
    bounded_context: e.bounded_context,
    aggregate_candidates: e.aggregate_candidates.slice(0, 5),
  }));
}

/** Merge module-level reports into project ddd_governance when available */
export function enrichDddFromModuleRollup(
  content: AiReportContent,
  rollup: ModuleIntentRollupEntry[]
): AiReportContent {
  if (!rollup.length || !content.ddd_governance) return content;

  const ddd = { ...content.ddd_governance };
  const contexts = [...(ddd.bounded_contexts ?? [])];

  const byContext = new Map<string, string[]>();
  for (const entry of rollup) {
    const ctxName = entry.bounded_context ?? `${entry.module_name}Context`;
    const mods = byContext.get(ctxName) ?? [];
    if (!mods.includes(entry.module_name)) mods.push(entry.module_name);
    byContext.set(ctxName, mods);
  }

  for (const [ctxName, modules] of byContext) {
    const existing = contexts.find((c) => c.name === ctxName);
    if (existing) {
      const merged = new Set([
        ...coerceToStringArray(existing.modules),
        ...modules,
      ]);
      existing.modules = Array.from(merged);
      const terms = rollup
        .filter((r) => modules.includes(r.module_name))
        .flatMap((r) => r.core_entities);
      existing.ubiquitous_language = Array.from(
        new Set([...(existing.ubiquitous_language ?? []), ...terms.slice(0, 8)])
      );
    } else {
      const sample = rollup.find((r) => modules.includes(r.module_name));
      contexts.push({
        name: ctxName,
        business_capability: sample?.purpose.slice(0, 120) ?? `模块 ${modules.join("、")} 业务域`,
        modules,
        context_type: "existing",
        boundary_rationale: `由 ${modules.length} 个模块级报告 rollup 聚合：${modules.join("、")}`,
        ubiquitous_language: (sample?.core_entities ?? []).slice(0, 6),
        confidence: "medium",
        evidence: modules.slice(0, 3).map((m) => ({
          ref: `module:${m}`,
          label: m,
          kind: "fact" as const,
        })),
      });
    }
  }

  const aggregates = [...(ddd.aggregates ?? [])];
  const aggRefs = new Set(aggregates.map((a) => a.aggregate_root.ref));

  for (const entry of rollup) {
    for (const cand of entry.aggregate_candidates) {
      if (cand.role !== "aggregate_root" || aggRefs.has(cand.ref)) continue;
      aggRefs.add(cand.ref);
      aggregates.push({
        name: cand.type_name,
        bounded_context: entry.bounded_context ?? `${entry.module_name}Context`,
        aggregate_root: {
          type_name: cand.type_name,
          module_name: entry.module_name,
          ref: cand.ref,
        },
        entities: entry.core_entities.filter((e) => e !== cand.type_name),
        invariants: [],
        consistency_boundary_note: `来自模块报告 rollup：${entry.module_name}`,
        confidence: "medium",
        evidence: [{ ref: cand.ref, label: cand.type_name, kind: "inference", confidence: "medium" }],
      });
    }
  }

  const rollupNote =
    rollup.length > 0
      ? `已 rollup ${rollup.length} 份模块级报告的业务意图与聚合候选。`
      : "";

  return {
    ...content,
    ddd_governance: {
      ...ddd,
      bounded_contexts: contexts,
      aggregates,
      strategy_notes: [ddd.strategy_notes, rollupNote].filter(Boolean).join(" "),
    },
  };
}

export function rollupToModuleIntentHints(rollup: ModuleIntentRollupEntry[]): ModuleIntentDetail[] {
  return rollup.map((e) => ({
    module_name: e.module_name,
    purpose: e.purpose,
    business_capabilities: e.business_capabilities,
    core_entities: e.core_entities,
    key_workflows: [],
    external_interfaces: [],
    upstream_modules: [],
    downstream_modules: [],
    confidence: "medium" as const,
    evidence: [{ ref: `module:${e.module_name}`, label: e.module_name, kind: "fact" as const }],
  }));
}
