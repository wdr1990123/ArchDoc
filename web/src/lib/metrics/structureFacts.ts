import {
  getGraphForScan,
  getIssuesForScan,
  getMetricsForScan,
  getModulesForScan,
  getPackageRefsForScan,
  getSummariesForScan,
} from "@/lib/metrics/scanMetrics";

const LAYER_ORDER = ["ui", "bll", "dal", "common", "unknown"] as const;

export function inferLayer(name: string, layer?: string | null): string {
  if (layer) return layer;
  const lower = name.toLowerCase();
  if (lower.includes(".web") || lower.includes(".ui") || lower.includes(".api")) return "ui";
  if (lower.includes(".bll") || lower.includes(".service") || lower.includes(".business"))
    return "bll";
  if (
    lower.includes(".dal") ||
    lower.includes(".data") ||
    lower.includes(".repository") ||
    lower.includes(".repo")
  )
    return "dal";
  if (lower.includes(".common") || lower.includes(".shared") || lower.includes(".core"))
    return "common";
  return "unknown";
}

export interface StructureModuleFact {
  id: string;
  external_id: string;
  name: string;
  loc: number;
  layer: string;
  ce: number;
  ca: number;
  instability: number;
  issue_count: number;
  top_types: string[];
}

export interface StructureDependencyFact {
  from: string;
  to: string;
  kind: string;
  from_layer: string;
  to_layer: string;
  ref: string;
}

export interface KeyDependencyChain {
  path: string[];
  reason: string;
  ref: string;
}

export interface StructureFacts {
  modules: StructureModuleFact[];
  dependencies: StructureDependencyFact[];
  layer_distribution: Record<string, string[]>;
  key_dependency_chains: KeyDependencyChain[];
  package_refs: Array<{
    module_name: string;
    package_id: string;
    version: string;
    ref: string;
  }>;
  total_loc: number;
  total_modules: number;
  issue_count: number;
}

function layerRank(layer: string): number {
  const idx = LAYER_ORDER.indexOf(layer as (typeof LAYER_ORDER)[number]);
  return idx >= 0 ? idx : LAYER_ORDER.length;
}

function isLayerSkip(fromLayer: string, toLayer: string): boolean {
  if (fromLayer === "unknown" || toLayer === "unknown") return false;
  return layerRank(fromLayer) < layerRank(toLayer) - 1;
}

function buildKeyChains(
  modules: StructureModuleFact[],
  dependencies: StructureDependencyFact[],
  issues: Awaited<ReturnType<typeof getIssuesForScan>>
): KeyDependencyChain[] {
  const chains: KeyDependencyChain[] = [];
  const nameToLayer = new Map(modules.map((m) => [m.name, m.layer]));
  const adj = new Map<string, string[]>();
  for (const d of dependencies) {
    const list = adj.get(d.from) ?? [];
    list.push(d.to);
    adj.set(d.from, list);
  }

  for (const issue of issues) {
    if (issue.rule_id === "LAYER_VIOLATION") {
      chains.push({
        path: [],
        reason: "layer_violation",
        ref: `issue:${issue.id}`,
      });
    }
    if (issue.rule_id === "CYCLE_SCC") {
      chains.push({
        path: [],
        reason: "cycle",
        ref: `issue:${issue.id}`,
      });
    }
  }

  for (const dep of dependencies) {
    if (isLayerSkip(dep.from_layer, dep.to_layer)) {
      chains.push({
        path: [dep.from, dep.to],
        reason: "layer_skip",
        ref: dep.ref,
      });
    }
  }

  for (const mod of modules.filter((m) => m.ce >= 3).slice(0, 5)) {
    const visited = new Set<string>();
    const queue: { node: string; path: string[] }[] = [{ node: mod.name, path: [mod.name] }];
    while (queue.length > 0 && chains.filter((c) => c.reason === "high_coupling").length < 5) {
      const { node, path } = queue.shift()!;
      if (path.length > 4) continue;
      for (const next of adj.get(node) ?? []) {
        if (visited.has(next)) continue;
        const nextPath = [...path, next];
        if (nextPath.length >= 2) {
          chains.push({
            path: nextPath,
            reason: "high_coupling",
            ref: `dep:${path[path.length - 1]}->${next}`,
          });
        }
        visited.add(next);
        queue.push({ node: next, path: nextPath });
      }
    }
  }

  const seen = new Set<string>();
  return chains
    .filter((c) => {
      const key = `${c.reason}:${c.ref}:${c.path.join("->")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

export async function buildStructureFacts(scanRunId: string): Promise<StructureFacts> {
  const [modules, metrics, issues, summaries, packageRefs, graph] = await Promise.all([
    getModulesForScan(scanRunId),
    getMetricsForScan(scanRunId),
    getIssuesForScan(scanRunId),
    getSummariesForScan(scanRunId),
    getPackageRefsForScan(scanRunId),
    getGraphForScan(scanRunId),
  ]);

  const summaryByModule = new Map(summaries.map((s) => [s.module_name, s.top_types ?? []]));

  const moduleFacts: StructureModuleFact[] = modules.map((mod) => {
    const modMetrics = metrics.filter((m) => m.module_id === mod.id);
    const ce = Number(modMetrics.find((m) => m.code === "M01")?.value ?? 0);
    const ca = Number(modMetrics.find((m) => m.code === "M02")?.value ?? 0);
    const instability = Number(modMetrics.find((m) => m.code === "M03")?.value ?? 0);
    const layer = inferLayer(mod.name, mod.layer);
    const issueCount = issues.filter((i) => i.module_ids.includes(mod.id)).length;
    return {
      id: mod.id,
      external_id: mod.external_id,
      name: mod.name,
      loc: mod.loc,
      layer,
      ce,
      ca,
      instability,
      issue_count: issueCount,
      top_types: summaryByModule.get(mod.name) ?? [],
    };
  });

  const idToName = new Map(modules.map((m) => [m.id, m.name]));
  const nameToLayer = new Map(moduleFacts.map((m) => [m.name, m.layer]));

  const dependencies: StructureDependencyFact[] = graph.edges.map((e) => {
    const fromName = String(e.data.source);
    const toName = String(e.data.target);
    const fromModule = modules.find((m) => m.id === fromName);
    const toModule = modules.find((m) => m.id === toName);
    const fromLabel = fromModule?.name ?? fromName;
    const toLabel = toModule?.name ?? toName;
    const fromLayer = nameToLayer.get(fromLabel) ?? "unknown";
    const toLayer = nameToLayer.get(toLabel) ?? "unknown";
    return {
      from: fromLabel,
      to: toLabel,
      kind: String(e.data.kind ?? "project_ref"),
      from_layer: fromLayer,
      to_layer: toLayer,
      ref: `dep:${fromLabel}->${toLabel}`,
    };
  });

  const layer_distribution: Record<string, string[]> = {};
  for (const mod of moduleFacts) {
    const list = layer_distribution[mod.layer] ?? [];
    list.push(mod.name);
    layer_distribution[mod.layer] = list;
  }

  const key_dependency_chains = buildKeyChains(moduleFacts, dependencies, issues);

  return {
    modules: moduleFacts,
    dependencies,
    layer_distribution,
    key_dependency_chains,
    package_refs: packageRefs.map((p) => ({
      module_name: p.module_name,
      package_id: p.package_id,
      version: p.version,
      ref: `package:${p.package_id}@${p.module_name}`,
    })),
    total_loc: moduleFacts.reduce((s, m) => s + m.loc, 0),
    total_modules: moduleFacts.length,
    issue_count: issues.length,
  };
}

export function filterStructureFactsForModule(
  facts: StructureFacts,
  moduleName: string
): StructureFacts {
  const related = new Set<string>([moduleName]);
  for (const d of facts.dependencies) {
    if (d.from === moduleName) related.add(d.to);
    if (d.to === moduleName) related.add(d.from);
  }
  return {
    ...facts,
    modules: facts.modules.filter((m) => related.has(m.name)),
    dependencies: facts.dependencies.filter(
      (d) => d.from === moduleName || d.to === moduleName
    ),
    key_dependency_chains: facts.key_dependency_chains.filter((c) =>
      c.path.includes(moduleName)
    ),
    package_refs: facts.package_refs.filter((p) => p.module_name === moduleName),
  };
}

/** Resolve module DB id by name for graph highlight links */
export function moduleNameToId(
  facts: StructureFacts,
  name: string
): string | undefined {
  return facts.modules.find((m) => m.name === name)?.id;
}
