import type { DiagnosticIssueRow, EvidenceCatalogEntry } from "@/lib/types";
import type { StructureFacts } from "@/lib/metrics/structureFacts";
import { moduleNameToId } from "@/lib/metrics/structureFacts";

export function buildExtendedEvidenceIndex(
  metrics: { id: string; code: string; module_name: string | null }[],
  issues: DiagnosticIssueRow[],
  structure: StructureFacts
): Map<string, boolean> {
  const index = new Map<string, boolean>();
  for (const m of metrics) {
    index.set(`metric:${m.id}`, true);
    index.set(`metric_code:${m.code}`, true);
    if (m.module_name) {
      index.set(`metric:${m.code}@${m.module_name}`, true);
    }
  }
  for (const i of issues) {
    index.set(`issue:${i.id}`, true);
    index.set(`rule:${i.rule_id}`, true);
  }
  for (const mod of structure.modules) {
    index.set(`module:${mod.name}`, true);
    index.set(`module_id:${mod.id}`, true);
  }
  for (const dep of structure.dependencies) {
    index.set(dep.ref, true);
  }
  for (const pkg of structure.package_refs) {
    index.set(pkg.ref, true);
  }
  for (const chain of structure.key_dependency_chains) {
    if (chain.ref) index.set(chain.ref, true);
  }
  index.set("structure", true);
  return index;
}

export function buildEvidenceCatalog(
  domainId: string,
  scanId: string,
  structure: StructureFacts,
  issues: DiagnosticIssueRow[],
  metrics: { id: string; code: string; value: number; module_name: string | null }[]
): Map<string, EvidenceCatalogEntry> {
  const catalog = new Map<string, EvidenceCatalogEntry>();
  const base = `/domains/${domainId}/scans/${scanId}`;

  for (const issue of issues) {
    catalog.set(`issue:${issue.id}`, {
      ref: `issue:${issue.id}`,
      label: issue.message,
      kind: "fact",
      link: `${base}/issues?issueId=${issue.id}`,
      detail: `[${issue.rule_id}] ${issue.severity}: ${issue.message}`,
    });
    catalog.set(`rule:${issue.rule_id}`, {
      ref: `rule:${issue.rule_id}`,
      label: issue.rule_id,
      kind: "fact",
      link: `${base}/issues?ruleId=${issue.rule_id}`,
      detail: issue.message,
    });
  }

  for (const m of metrics) {
    catalog.set(`metric:${m.id}`, {
      ref: `metric:${m.id}`,
      label: `${m.code}${m.module_name ? ` @ ${m.module_name}` : ""} = ${m.value}`,
      kind: "fact",
      link: `${base}?metric=${m.id}`,
      detail: `指标 ${m.code}：${m.value}`,
    });
    catalog.set(`metric_code:${m.code}`, {
      ref: `metric_code:${m.code}`,
      label: m.code,
      kind: "fact",
      link: `${base}`,
      detail: `指标代码 ${m.code}`,
    });
    if (m.module_name) {
      catalog.set(`metric:${m.code}@${m.module_name}`, {
        ref: `metric:${m.code}@${m.module_name}`,
        label: `${m.code} @ ${m.module_name}`,
        kind: "fact",
        link: `${base}?metric=${m.id}`,
        detail: `${m.code} = ${m.value}`,
      });
    }
  }

  for (const mod of structure.modules) {
    catalog.set(`module:${mod.name}`, {
      ref: `module:${mod.name}`,
      label: mod.name,
      kind: "fact",
      link: `${base}/architecture#module-${encodeURIComponent(mod.name)}`,
      detail: `${mod.layer} · LOC ${mod.loc} · Ce ${mod.ce} · Ca ${mod.ca}`,
    });
    catalog.set(`module_id:${mod.id}`, {
      ref: `module_id:${mod.id}`,
      label: mod.name,
      kind: "fact",
      link: `${base}/architecture#module-${encodeURIComponent(mod.name)}`,
      detail: mod.name,
    });
  }

  for (const dep of structure.dependencies) {
    const highlightId = moduleNameToId(structure, dep.from);
    catalog.set(dep.ref, {
      ref: dep.ref,
      label: `${dep.from} → ${dep.to}`,
      kind: "fact",
      link: highlightId ? `${base}/graph?highlight=${highlightId}` : `${base}/graph`,
      detail: `${dep.from_layer} → ${dep.to_layer} (${dep.kind})`,
    });
  }

  for (const pkg of structure.package_refs) {
    catalog.set(pkg.ref, {
      ref: pkg.ref,
      label: `${pkg.module_name} → ${pkg.package_id}`,
      kind: "fact",
      link: `${base}/architecture#module-${encodeURIComponent(pkg.module_name)}`,
      detail: `NuGet ${pkg.package_id} ${pkg.version}`,
    });
  }

  for (const chain of structure.key_dependency_chains) {
    if (!chain.ref || catalog.has(chain.ref)) continue;
    const first = chain.path[0];
    const highlightId = first ? moduleNameToId(structure, first) : undefined;
    catalog.set(chain.ref, {
      ref: chain.ref,
      label: chain.path.length ? chain.path.join(" → ") : chain.reason,
      kind: "fact",
      link: highlightId ? `${base}/graph?highlight=${highlightId}` : `${base}/graph`,
      detail: chain.reason,
    });
  }

  catalog.set("structure", {
    ref: "structure",
    label: "架构结构事实",
    kind: "fact",
    link: `${base}/architecture`,
    detail: `${structure.total_modules} 模块 · ${structure.total_loc} LOC`,
  });

  return catalog;
}

export function normalizeEvidenceItems(
  items: Array<{ ref: string; label?: string; kind?: string; confidence?: string }> | undefined,
  legacyRefs: string[] | undefined,
  catalog: Map<string, EvidenceCatalogEntry>
) {
  const result: EvidenceCatalogEntry[] = [];
  const seen = new Set<string>();

  for (const item of items ?? []) {
    if (seen.has(item.ref)) continue;
    seen.add(item.ref);
    const known = catalog.get(item.ref);
    result.push({
      ref: item.ref,
      label: item.label ?? known?.label ?? item.ref,
      kind: (item.kind as "fact" | "inference") ?? known?.kind ?? "fact",
      confidence: item.confidence as EvidenceCatalogEntry["confidence"],
      link: known?.link,
      detail: known?.detail,
    });
  }

  for (const ref of legacyRefs ?? []) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const known = catalog.get(ref);
    result.push(
      known ?? {
        ref,
        label: ref,
        kind: "fact",
      }
    );
  }

  return result;
}
