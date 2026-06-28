import { query, queryOne } from "@/lib/db/client";
import {
  getIssuesForScan,
  getMetricsForScan,
  getModulesForScan,
  getSummariesForScan,
} from "@/lib/metrics/scanMetrics";
import { buildStructureFacts, filterStructureFactsForModule } from "@/lib/metrics/structureFacts";
import type { ScanResultPayload, ScanResultPublicType } from "@/lib/types";

export interface ModuleContextPack {
  module_name: string;
  module_id: string;
  external_id: string;
  layer: string;
  loc: number;
  ce: number;
  ca: number;
  issue_count: number;
  schema_version: string;
  has_deep_read: boolean;
  summary: {
    top_types: string[];
    snippet: string;
    role_hints: string[];
  } | null;
  metadata: {
    namespaces?: Array<{ name: string; type_count: number }>;
    public_surface?: ScanResultPublicType[];
    folder_layout?: string[];
    role_hints?: string[];
  };
  dependencies: {
    upstream: string[];
    downstream: string[];
    project_refs: Array<{ from: string; to: string; ref: string }>;
  };
  issues: Array<{ id: string; rule_id: string; severity: string; message: string }>;
  metrics: Array<{ id: string; code: string; value: number }>;
  type_dependencies: Array<{
    from_type: string;
    to_type: string;
    to_module_name: string;
    count: number;
  }>;
  package_refs: Array<{ package_id: string; version: string }>;
}

async function getScanArtifact(scanRunId: string): Promise<ScanResultPayload | null> {
  const row = await queryOne<{ artifact: ScanResultPayload | string }>(
    `SELECT artifact FROM scan_runs WHERE id = $1`,
    [scanRunId]
  );
  if (!row?.artifact) return null;
  if (typeof row.artifact === "string") {
    try {
      return JSON.parse(row.artifact) as ScanResultPayload;
    } catch {
      return null;
    }
  }
  return row.artifact;
}

export async function buildModuleContextPack(
  scanRunId: string,
  moduleName: string
): Promise<ModuleContextPack | null> {
  const modules = await getModulesForScan(scanRunId);
  const mod = modules.find((m) => m.name === moduleName);
  if (!mod) return null;

  const [structure, issues, metrics, summaries, artifact, scanRun] = await Promise.all([
    buildStructureFacts(scanRunId),
    getIssuesForScan(scanRunId),
    getMetricsForScan(scanRunId),
    getSummariesForScan(scanRunId),
    getScanArtifact(scanRunId),
    queryOne<{ schema_version: string }>(
      `SELECT schema_version FROM scan_runs WHERE id = $1`,
      [scanRunId]
    ),
  ]);

  const filtered = filterStructureFactsForModule(structure, moduleName);
  const modFact = filtered.modules[0];
  if (!modFact) return null;

  const summaryRow = summaries.find((s) => s.module_name === moduleName);
  const metaRow = await queryOne<{ metadata: Record<string, unknown> }>(
    `SELECT metadata FROM modules WHERE id = $1`,
    [mod.id]
  );
  const metadata = (metaRow?.metadata ?? {}) as ModuleContextPack["metadata"];

  const artifactSummary = artifact?.summaries?.find(
    (s) => s.module_id === mod.external_id
  );
  const roleHints =
    artifactSummary?.role_hints ??
    (metadata.role_hints as string[] | undefined) ??
    [];

  const externalId = mod.external_id;
  const moduleIdToName = new Map(modules.map((m) => [m.external_id, m.name]));

  const typeDeps: ModuleContextPack["type_dependencies"] = [];
  if (artifact?.type_dependencies) {
    for (const td of artifact.type_dependencies) {
      if (td.from_module_id !== externalId && td.to_module_id !== externalId) continue;
      const toName = moduleIdToName.get(
        td.from_module_id === externalId ? td.to_module_id : td.from_module_id
      );
      if (!toName) continue;
      typeDeps.push({
        from_type: td.from_type,
        to_type: td.to_type,
        to_module_name: toName,
        count: td.count,
      });
    }
    typeDeps.sort((a, b) => b.count - a.count);
  }

  const modIssues = issues.filter((i) => i.module_ids.includes(mod.id));
  const modMetrics = metrics.filter((m) => m.module_id === mod.id);

  const upstream = filtered.dependencies
    .filter((d) => d.from === moduleName)
    .map((d) => d.to);
  const downstream = filtered.dependencies
    .filter((d) => d.to === moduleName)
    .map((d) => d.from);

  const pkgRefs =
    artifact?.package_refs
      ?.filter((p) => p.module_id === externalId)
      .map((p) => ({ package_id: p.package_id, version: p.version ?? "" })) ?? [];

  const publicSurface = (metadata.public_surface ?? []) as ScanResultPublicType[];
  const hasDeepRead =
    publicSurface.length > 0 ||
    (metadata.namespaces?.length ?? 0) > 0 ||
    artifact?.schema_version === "1.1" ||
    artifact?.schema_version === "1.2";

  return {
    module_name: moduleName,
    module_id: mod.id,
    external_id: externalId,
    layer: modFact.layer,
    loc: modFact.loc,
    ce: modFact.ce,
    ca: modFact.ca,
    issue_count: modFact.issue_count,
    schema_version: scanRun?.schema_version ?? "1.0",
    has_deep_read: hasDeepRead,
    summary: summaryRow
      ? {
          top_types: summaryRow.top_types ?? [],
          snippet: summaryRow.snippet ?? "",
          role_hints: roleHints,
        }
      : null,
    metadata: {
      namespaces: metadata.namespaces as ModuleContextPack["metadata"]["namespaces"],
      public_surface: publicSurface,
      folder_layout: metadata.folder_layout as string[] | undefined,
      role_hints: roleHints,
    },
    dependencies: {
      upstream: Array.from(new Set(upstream)),
      downstream: Array.from(new Set(downstream)),
      project_refs: filtered.dependencies.map((d) => ({
        from: d.from,
        to: d.to,
        ref: d.ref,
      })),
    },
    issues: modIssues.map((i) => ({
      id: i.id,
      rule_id: i.rule_id,
      severity: i.severity,
      message: i.message,
    })),
    metrics: modMetrics.map((m) => ({
      id: m.id,
      code: m.code,
      value: Number(m.value),
    })),
    type_dependencies: typeDeps.slice(0, 20),
    package_refs: pkgRefs,
  };
}

/** Latest module report per module name */
export async function getLatestModuleReportMap(scanRunId: string) {
  const reports = await query<{
    id: string;
    module_name: string | null;
    purpose: string | null;
    status: string;
  }>(
    `SELECT dr.id, dr.status,
            COALESCE(
              dr.content->'module_intent'->>'module_name',
              dr.content->'module_roles'->0->>'module_name'
            ) AS module_name,
            COALESCE(
              dr.content->'module_intent'->>'purpose',
              dr.content->'module_roles'->0->>'responsibility_hypothesis'
            ) AS purpose
     FROM diagnostic_reports dr
     WHERE dr.scan_run_id = $1 AND dr.report_type = 'module' AND dr.status IN ('completed', 'partial')
     ORDER BY dr.created_at DESC`,
    [scanRunId]
  );

  const map = new Map<string, { id: string; purpose: string | null; status: string }>();
  for (const r of reports) {
    if (!r.module_name || map.has(r.module_name)) continue;
    map.set(r.module_name, { id: r.id, purpose: r.purpose, status: r.status });
  }
  return map;
}

/** Register type:{module}:{TypeName} refs for validation */
export function registerModuleTypeRef(
  evidenceIndex: Map<string, boolean>,
  moduleName: string,
  typeName: string
): void {
  const shortName = typeName.includes(".") ? typeName.split(".").pop()! : typeName;
  evidenceIndex.set(`type:${moduleName}:${shortName}`, true);
  evidenceIndex.set(`type:${moduleName}:${typeName}`, true);
}

/** Register public types for all modules in a project scan */
export function indexAllModuleTypeEvidence(
  evidenceIndex: Map<string, boolean>,
  moduleDeepFacts: Array<{ name: string; metadata: Record<string, unknown> }>,
  summaries: Array<{ module_name: string; top_types: string[] }> = []
): void {
  for (const mod of moduleDeepFacts) {
    const surface = mod.metadata.public_surface as Array<{ type_name: string }> | undefined;
    for (const pt of surface ?? []) {
      registerModuleTypeRef(evidenceIndex, mod.name, pt.type_name);
    }
  }
  for (const summary of summaries) {
    for (const typeName of summary.top_types ?? []) {
      registerModuleTypeRef(evidenceIndex, summary.module_name, typeName);
    }
  }
}

/** Register type:* evidence refs from public_surface for validation */
export function indexModuleTypeEvidence(
  evidenceIndex: Map<string, boolean>,
  context: ModuleContextPack
): Set<string> {
  const typeNames = new Set<string>();
  for (const pt of context.metadata.public_surface ?? []) {
    const shortName = pt.type_name.includes(".")
      ? pt.type_name.split(".").pop()!
      : pt.type_name;
    typeNames.add(shortName);
    typeNames.add(pt.type_name);
    registerModuleTypeRef(evidenceIndex, context.module_name, pt.type_name);
  }
  return typeNames;
}
