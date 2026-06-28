import { query, queryOne, withTransaction } from "./client";
import type { CrossRepoDependencyRow, DomainSnapshotRow } from "@/lib/types";

export async function createDomainSnapshot(
  domainId: string,
  name: string,
  scanRunIds: string[]
): Promise<DomainSnapshotRow> {
  return withTransaction(async (client) => {
    const snapshot = await client.query<DomainSnapshotRow>(
      `INSERT INTO domain_snapshots (domain_id, name, scan_run_ids, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [domainId, name, scanRunIds]
    );
    const snapshotId = snapshot.rows[0].id;

    const scanRuns = await client.query<{ id: string; repository_id: string }>(
      `SELECT sr.id, sr.repository_id
       FROM scan_runs sr
       JOIN repositories r ON r.id = sr.repository_id
       WHERE sr.id = ANY($1::uuid[]) AND r.domain_id = $2`,
      [scanRunIds, domainId]
    );

    if (scanRuns.rowCount !== scanRunIds.length) {
      throw new Error("One or more scan runs not found in domain");
    }

    const modulePackages = await client.query<{
      scan_run_id: string;
      repository_id: string;
      module_name: string;
      package_id: string;
      version: string;
    }>(
      `SELECT pr.scan_run_id, sr.repository_id, m.name AS module_name, pr.package_id, pr.version
       FROM package_refs pr
       JOIN modules m ON m.id = pr.module_id
       JOIN scan_runs sr ON sr.id = pr.scan_run_id
       WHERE pr.scan_run_id = ANY($1::uuid[])`,
      [scanRunIds]
    );

    const assemblyNames = await client.query<{
      scan_run_id: string;
      repository_id: string;
      module_name: string;
    }>(
      `SELECT m.scan_run_id, sr.repository_id, m.name AS module_name
       FROM modules m
       JOIN scan_runs sr ON sr.id = m.scan_run_id
       WHERE m.scan_run_id = ANY($1::uuid[]) AND m.kind = 'project'`,
      [scanRunIds]
    );

    const assemblyIndex = new Map<string, { repoId: string; moduleName: string; scanRunId: string }>();
    for (const row of assemblyNames.rows) {
      const key = row.module_name.split(".").pop()?.toLowerCase() ?? row.module_name.toLowerCase();
      assemblyIndex.set(key, {
        repoId: row.repository_id,
        moduleName: row.module_name,
        scanRunId: row.scan_run_id,
      });
      assemblyIndex.set(row.module_name.toLowerCase(), {
        repoId: row.repository_id,
        moduleName: row.module_name,
        scanRunId: row.scan_run_id,
      });
    }

    let crossRepoCount = 0;
    const versionDrift = new Map<string, Set<string>>();

    for (const pkg of modulePackages.rows) {
      if (!versionDrift.has(pkg.package_id)) {
        versionDrift.set(pkg.package_id, new Set());
      }
      versionDrift.get(pkg.package_id)!.add(pkg.version);
      const target = assemblyIndex.get(pkg.package_id.toLowerCase());
      if (target && target.repoId !== pkg.repository_id) {
        await client.query(
          `INSERT INTO cross_repo_dependencies (
             snapshot_id, from_module_name, to_module_name, kind, package_id, version, weight
           ) VALUES ($1, $2, $3, 'nuget', $4, $5, 1)`,
          [snapshotId, pkg.module_name, target.moduleName, pkg.package_id, pkg.version]
        );
        crossRepoCount++;
      }
    }

    const driftIssues = Array.from(versionDrift.entries()).filter(
      ([, versions]) => versions.size > 1
    );

    await client.query(
      `UPDATE domain_snapshots
       SET status = 'completed',
           metadata = $2
       WHERE id = $1`,
      [
        snapshotId,
        JSON.stringify({
          cross_repo_dependency_count: crossRepoCount,
          version_drift_packages: driftIssues.map(([pkg, versions]) => ({
            package_id: pkg,
            versions: Array.from(versions),
          })),
          scan_run_count: scanRunIds.length,
        }),
      ]
    );

    return (await client.query<DomainSnapshotRow>(
      `SELECT * FROM domain_snapshots WHERE id = $1`,
      [snapshotId]
    )).rows[0];
  });
}

export async function getDomainSnapshot(id: string): Promise<DomainSnapshotRow | null> {
  return queryOne<DomainSnapshotRow>(
    `SELECT * FROM domain_snapshots WHERE id = $1`,
    [id]
  );
}

export async function listDomainSnapshots(domainId: string): Promise<DomainSnapshotRow[]> {
  return query<DomainSnapshotRow>(
    `SELECT * FROM domain_snapshots WHERE domain_id = $1 ORDER BY created_at DESC`,
    [domainId]
  );
}

export async function getCrossRepoDependencies(snapshotId: string): Promise<CrossRepoDependencyRow[]> {
  return query<CrossRepoDependencyRow>(
    `SELECT * FROM cross_repo_dependencies WHERE snapshot_id = $1`,
    [snapshotId]
  );
}

export async function getFederationGraph(snapshotId: string) {
  const snapshot = await getDomainSnapshot(snapshotId);
  if (!snapshot) return null;

  const repos = await query<{ id: string; name: string; scan_run_id: string }>(
    `SELECT r.id, r.name, sr.id AS scan_run_id
     FROM repositories r
     JOIN scan_runs sr ON sr.repository_id = r.id
     WHERE sr.id = ANY($1::uuid[])`,
    [snapshot.scan_run_ids]
  );

  const crossDeps = await getCrossRepoDependencies(snapshotId);

  const moduleToRepo = new Map<string, string>();
  const moduleRows = await query<{ module_name: string; repository_id: string }>(
    `SELECT m.name AS module_name, sr.repository_id
     FROM modules m
     JOIN scan_runs sr ON sr.id = m.scan_run_id
     WHERE m.scan_run_id = ANY($1::uuid[])`,
    [snapshot.scan_run_ids]
  );
  for (const row of moduleRows) {
    moduleToRepo.set(row.module_name, row.repository_id);
  }

  const nodes = repos.map((r) => ({
    data: { id: r.id, label: r.name, scanRunId: r.scan_run_id, type: "repository" },
  }));

  const edgeMap = new Map<string, { source: string; target: string; weight: number; packages: string[] }>();

  for (const dep of crossDeps) {
    const fromRepo = dep.from_module_name
      ? moduleToRepo.get(dep.from_module_name)
      : undefined;
    const toRepo = dep.to_module_name
      ? moduleToRepo.get(dep.to_module_name)
      : undefined;
    if (!fromRepo || !toRepo || fromRepo === toRepo) continue;

    const key = `${fromRepo}-${toRepo}`;
    const existing = edgeMap.get(key) ?? {
      source: fromRepo,
      target: toRepo,
      weight: 0,
      packages: [],
    };
    existing.weight += dep.weight;
    if (dep.package_id) existing.packages.push(dep.package_id);
    edgeMap.set(key, existing);
  }

  const edges = Array.from(edgeMap.values()).map((e, i) => ({
    data: {
      id: `cross-${i}`,
      source: e.source,
      target: e.target,
      weight: e.weight,
      label: e.packages.slice(0, 2).join(", "),
    },
  }));

  return {
    snapshot,
    nodes,
    edges,
    crossRepoDependencies: crossDeps,
    metadata: snapshot.metadata,
  };
}

export async function computeStranglerCandidates(scanRunId: string) {
  const modules = await query<{
    id: string;
    name: string;
    loc: number;
    layer: string | null;
  }>(`SELECT id, name, loc, layer FROM modules WHERE scan_run_id = $1`, [scanRunId]);

  const metrics = await query<{ module_id: string; code: string; value: number }>(
    `SELECT module_id, code, value FROM metric_values WHERE scan_run_id = $1`,
    [scanRunId]
  );

  const issues = await query<{ module_ids: string[]; rule_id: string }>(
    `SELECT module_ids, rule_id FROM diagnostic_issues WHERE scan_run_id = $1`,
    [scanRunId]
  );

  const cycleModules = new Set<string>();
  for (const issue of issues) {
    if (issue.rule_id === "CYCLE_SCC") {
      for (const id of issue.module_ids) cycleModules.add(id);
    }
  }

  const candidates = modules.map((mod) => {
    const modMetrics = metrics.filter((m) => m.module_id === mod.id);
    const ce = Number(modMetrics.find((m) => m.code === "M01")?.value ?? 0);
    const ca = Number(modMetrics.find((m) => m.code === "M02")?.value ?? 0);
    const inCycle = cycleModules.has(mod.id);
    const score = Math.max(
      0,
      Math.min(
        100,
        100 - ce * 3 - ca * 2 - (inCycle ? 40 : 0) + (mod.layer === "ui" ? 10 : 0)
      )
    );
    return {
      module_id: mod.id,
      module_name: mod.name,
      score,
      ce,
      ca,
      inCycle,
      rationale: inCycle
        ? "处于循环依赖中，拆分前需先解除循环"
        : ca <= 2
          ? "叶节点模块，入向耦合较低"
          : "中等候选，需评估共享依赖",
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5);
}
