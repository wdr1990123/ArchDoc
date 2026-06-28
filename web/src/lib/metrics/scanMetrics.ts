import { query, queryOne } from "@/lib/db/client";
import type { DiagnosticIssueRow, ModuleRow } from "@/lib/types";

export async function getModulesForScan(scanRunId: string): Promise<ModuleRow[]> {
  return query<ModuleRow>(
    `SELECT * FROM modules WHERE scan_run_id = $1 ORDER BY name`,
    [scanRunId]
  );
}

export async function getIssuesForScan(
  scanRunId: string,
  severity?: string
): Promise<DiagnosticIssueRow[]> {
  if (severity) {
    return query<DiagnosticIssueRow>(
      `SELECT * FROM diagnostic_issues
       WHERE scan_run_id = $1 AND severity = $2
       ORDER BY CASE severity
         WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
      [scanRunId, severity]
    );
  }
  return query<DiagnosticIssueRow>(
    `SELECT * FROM diagnostic_issues
     WHERE scan_run_id = $1
     ORDER BY CASE severity
       WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
    [scanRunId]
  );
}

export async function getMetricsForScan(scanRunId: string) {
  return query<{
    id: string;
    module_id: string | null;
    code: string;
    value: number;
    module_name: string | null;
  }>(
    `SELECT mv.*, m.name AS module_name
     FROM metric_values mv
     LEFT JOIN modules m ON m.id = mv.module_id
     WHERE mv.scan_run_id = $1`,
    [scanRunId]
  );
}

export async function getGraphForScan(scanRunId: string) {
  const modules = await getModulesForScan(scanRunId);
  const edges = await query<{
    id: string;
    from_module_id: string;
    to_module_id: string;
    kind: string;
    weight: number;
    from_name: string;
    to_name: string;
  }>(
    `SELECT d.*, fm.name AS from_name, tm.name AS to_name
     FROM dependencies d
     JOIN modules fm ON fm.id = d.from_module_id
     JOIN modules tm ON tm.id = d.to_module_id
     WHERE d.scan_run_id = $1`,
    [scanRunId]
  );

  const issueModuleIds = new Set<string>();
  const cycleIssues = await query<{ module_ids: string[] }>(
    `SELECT module_ids FROM diagnostic_issues
     WHERE scan_run_id = $1 AND rule_id = 'CYCLE_SCC'`,
    [scanRunId]
  );
  for (const issue of cycleIssues) {
    for (const id of issue.module_ids) issueModuleIds.add(id);
  }

  const nodes = modules.map((m) => ({
    data: {
      id: m.id,
      label: m.name,
      loc: m.loc,
      layer: m.layer,
      inCycle: issueModuleIds.has(m.id),
    },
  }));

  const cytoscapeEdges = edges.map((e) => ({
    data: {
      id: e.id,
      source: e.from_module_id,
      target: e.to_module_id,
      kind: e.kind,
      weight: e.weight,
      label: e.kind,
    },
  }));

  return { nodes, edges: cytoscapeEdges, moduleCount: modules.length, edgeCount: edges.length };
}

export async function getScanOverview(scanRunId: string) {
  const scan = await queryOne(`SELECT * FROM scan_runs WHERE id = $1`, [scanRunId]);
  if (!scan) return null;

  const modules = await getModulesForScan(scanRunId);
  const issues = await getIssuesForScan(scanRunId);
  const metrics = await getMetricsForScan(scanRunId);

  const issueCounts = {
    critical: issues.filter((i) => i.severity === "critical").length,
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium").length,
    low: issues.filter((i) => i.severity === "low").length,
  };

  const moduleScores = modules.map((mod) => {
    const modMetrics = metrics.filter((m) => m.module_id === mod.id);
    const ce = Number(modMetrics.find((m) => m.code === "M01")?.value ?? 0);
    const ca = Number(modMetrics.find((m) => m.code === "M02")?.value ?? 0);
    const instability = Number(modMetrics.find((m) => m.code === "M03")?.value ?? 0);
    const modIssues = issues.filter((i) => i.module_ids.includes(mod.id));
    const riskScore = ce * 2 + ca + modIssues.length * 5 +
      (modIssues.some((i) => i.severity === "critical") ? 20 : 0);
    return { module: mod, ce, ca, instability, issueCount: modIssues.length, riskScore };
  });

  moduleScores.sort((a, b) => b.riskScore - a.riskScore);

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        issueCounts.critical * 15 -
        issueCounts.high * 8 -
        issueCounts.medium * 3 -
        issueCounts.low
    )
  );

  const radar = buildRadarMetrics(metrics, issues);

  return {
    scan,
    healthScore,
    issueCounts,
    totalModules: modules.length,
    totalLoc: modules.reduce((s, m) => s + m.loc, 0),
    topRiskModules: moduleScores.slice(0, 5),
    radar,
  };
}

function buildRadarMetrics(
  metrics: { code: string; value: number }[],
  issues: DiagnosticIssueRow[]
) {
  const avg = (code: string) => {
    const vals = metrics.filter((m) => m.code === code).map((m) => Number(m.value));
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const ce = avg("M01");
  const ca = avg("M02");
  const instability = avg("M03");
  const cycles = issues.filter((i) => i.rule_id === "CYCLE_SCC").length;
  const layerViolations = issues.filter((i) => i.rule_id === "LAYER_VIOLATION").length;

  const normalize = (v: number, max: number) => Math.max(0, Math.min(100, 100 - (v / max) * 100));

  return {
    dimensions: ["Ce", "Ca", "Stability", "Acyclic", "LayerCompliance"],
    values: [
      normalize(ce, 20),
      normalize(ca, 20),
      normalize(instability * 100, 100),
      cycles === 0 ? 100 : Math.max(0, 100 - cycles * 25),
      layerViolations === 0 ? 100 : Math.max(0, 100 - layerViolations * 10),
    ],
  };
}

export async function getSummariesForScan(scanRunId: string) {
  return query<{
    module_id: string;
    module_name: string;
    top_types: string[];
    snippet: string;
  }>(
    `SELECT ms.module_id, m.name AS module_name, ms.top_types, ms.snippet
     FROM module_summaries ms
     JOIN modules m ON m.id = ms.module_id
     WHERE ms.scan_run_id = $1`,
    [scanRunId]
  );
}

export async function getPackageRefsForScan(scanRunId: string) {
  return query<{
    module_id: string;
    module_name: string;
    package_id: string;
    version: string;
  }>(
    `SELECT pr.*, m.name AS module_name
     FROM package_refs pr
     JOIN modules m ON m.id = pr.module_id
     WHERE pr.scan_run_id = $1`,
    [scanRunId]
  );
}

export function buildEvidenceIndex(
  metrics: { id: string; code: string; module_name: string | null }[],
  issues: DiagnosticIssueRow[]
) {
  const index = new Map<string, boolean>();
  for (const m of metrics) {
    index.set(`metric:${m.id}`, true);
    index.set(`metric_code:${m.code}`, true);
  }
  for (const i of issues) {
    index.set(`issue:${i.id}`, true);
    index.set(`rule:${i.rule_id}`, true);
  }
  return index;
}
