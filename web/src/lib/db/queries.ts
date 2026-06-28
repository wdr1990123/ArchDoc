import { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "./client";
import type {
  DiagnosisDomain,
  Repository,
  ScanRun,
  ScanResultPayload,
} from "@/lib/types";

export async function listDomains(): Promise<DiagnosisDomain[]> {
  return query<DiagnosisDomain>(
    `SELECT * FROM diagnosis_domains ORDER BY created_at DESC`
  );
}

export async function getDomain(id: string): Promise<DiagnosisDomain | null> {
  return queryOne<DiagnosisDomain>(
    `SELECT * FROM diagnosis_domains WHERE id = $1`,
    [id]
  );
}

export async function findDomainByName(name: string): Promise<DiagnosisDomain | null> {
  return queryOne<DiagnosisDomain>(
    `SELECT * FROM diagnosis_domains WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
    [name]
  );
}

export async function createDomain(
  name: string,
  description?: string
): Promise<DiagnosisDomain> {
  const row = await queryOne<DiagnosisDomain>(
    `INSERT INTO diagnosis_domains (name, description)
     VALUES ($1, $2)
     RETURNING *`,
    [name, description ?? null]
  );
  if (!row) throw new Error("Failed to create domain");
  return row;
}

export async function deleteDomain(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM diagnosis_domains WHERE id = $1 RETURNING id`,
    [id]
  );
  return row !== null;
}

export async function listRepositoriesByDomain(
  domainId: string
): Promise<Repository[]> {
  return query<Repository>(
    `SELECT * FROM repositories WHERE domain_id = $1 ORDER BY created_at DESC`,
    [domainId]
  );
}

export async function getRepository(id: string): Promise<Repository | null> {
  return queryOne<Repository>(`SELECT * FROM repositories WHERE id = $1`, [
    id,
  ]);
}

export async function createRepository(input: {
  domain_id: string;
  name: string;
  source_type?: string;
  repo_url?: string;
  solution_path?: string;
}): Promise<Repository> {
  const row = await queryOne<Repository>(
    `INSERT INTO repositories (domain_id, name, source_type, repo_url, solution_path)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.domain_id,
      input.name,
      input.source_type ?? "local",
      input.repo_url ?? null,
      input.solution_path ?? null,
    ]
  );
  if (!row) throw new Error("Failed to create repository");
  return row;
}

export async function getScanRun(id: string): Promise<ScanRun | null> {
  return queryOne<ScanRun>(`SELECT * FROM scan_runs WHERE id = $1`, [id]);
}

export async function listScanRunsByRepository(
  repositoryId: string
): Promise<ScanRun[]> {
  return query<ScanRun>(
    `SELECT * FROM scan_runs WHERE repository_id = $1 ORDER BY created_at DESC`,
    [repositoryId]
  );
}

export async function listScanRunsByDomain(
  domainId: string
): Promise<(ScanRun & { repository_name: string })[]> {
  return query(
    `SELECT sr.*, r.name AS repository_name
     FROM scan_runs sr
     JOIN repositories r ON r.id = sr.repository_id
     WHERE r.domain_id = $1
     ORDER BY sr.created_at DESC`,
    [domainId]
  );
}

async function insertScanResult(
  client: PoolClient,
  repositoryId: string,
  payload: ScanResultPayload
): Promise<string> {
  const repo = await client.query(`SELECT id FROM repositories WHERE id = $1`, [
    repositoryId,
  ]);
  if (repo.rowCount === 0) {
    throw new Error("Repository not found");
  }

  const scanRun = await client.query<{ id: string }>(
    `INSERT INTO scan_runs (
       repository_id, status, solution_path, commit_sha, schema_version,
       artifact, started_at, finished_at
     ) VALUES ($1, 'completed', $2, $3, $4, $5, $6, now())
     RETURNING id`,
    [
      repositoryId,
      payload.solution_path,
      payload.commit_sha ?? null,
      payload.schema_version,
      JSON.stringify(payload),
      payload.scanned_at,
    ]
  );
  const scanRunId = scanRun.rows[0].id;

  const moduleIdMap = new Map<string, string>();

  for (const mod of payload.modules) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO modules (scan_run_id, external_id, name, kind, loc, layer)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        scanRunId,
        mod.id,
        mod.name,
        mod.kind,
        mod.loc ?? 0,
        mod.layer ?? null,
      ]
    );
    moduleIdMap.set(mod.id, inserted.rows[0].id);
  }

  for (const dep of payload.dependencies) {
    const fromId = moduleIdMap.get(dep.from);
    const toId = moduleIdMap.get(dep.to);
    if (!fromId || !toId) continue;
    await client.query(
      `INSERT INTO dependencies (scan_run_id, from_module_id, to_module_id, kind, weight)
       VALUES ($1, $2, $3, $4, $5)`,
      [scanRunId, fromId, toId, dep.kind, dep.weight ?? 1]
    );
  }

  for (const metric of payload.metrics) {
    const moduleId = moduleIdMap.get(metric.module_id);
    await client.query(
      `INSERT INTO metric_values (scan_run_id, module_id, code, value)
       VALUES ($1, $2, $3, $4)`,
      [scanRunId, moduleId ?? null, metric.code, metric.value]
    );
  }

  for (const issue of payload.issues) {
    const moduleIds = (issue.module_ids ?? [])
      .map((extId) => moduleIdMap.get(extId))
      .filter(Boolean) as string[];
    await client.query(
      `INSERT INTO diagnostic_issues (scan_run_id, rule_id, severity, message, module_ids, location)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        scanRunId,
        issue.rule_id,
        issue.severity,
        issue.message,
        moduleIds,
        JSON.stringify(issue.location ?? {}),
      ]
    );
  }

  for (const pkg of payload.package_refs ?? []) {
    const moduleId = moduleIdMap.get(pkg.module_id);
    if (!moduleId) continue;
    await client.query(
      `INSERT INTO package_refs (scan_run_id, module_id, package_id, version)
       VALUES ($1, $2, $3, $4)`,
      [scanRunId, moduleId, pkg.package_id, pkg.version ?? ""]
    );
  }

  for (const summary of payload.summaries ?? []) {
    const moduleId = moduleIdMap.get(summary.module_id);
    if (!moduleId) continue;
    await client.query(
      `INSERT INTO module_summaries (scan_run_id, module_id, top_types, snippet)
       VALUES ($1, $2, $3, $4)`,
      [
        scanRunId,
        moduleId,
        JSON.stringify(summary.top_types ?? []),
        summary.snippet ?? "",
      ]
    );
  }

  return scanRunId;
}

export async function ingestScanResult(
  payload: ScanResultPayload
): Promise<{ scan_run_id: string }> {
  if (payload.schema_version !== "1.0") {
    throw new Error(`Unsupported schema version: ${payload.schema_version}`);
  }
  const scanRunId = await withTransaction((client) =>
    insertScanResult(client, payload.repository_id, payload)
  );
  return { scan_run_id: scanRunId };
}

export async function getRepositoryForScanRun(scanRunId: string) {
  return queryOne<Repository>(
    `SELECT r.* FROM repositories r
     JOIN scan_runs sr ON sr.repository_id = r.id
     WHERE sr.id = $1`,
    [scanRunId]
  );
}

export async function getDomainForScanRun(scanRunId: string) {
  return queryOne<DiagnosisDomain>(
    `SELECT d.* FROM diagnosis_domains d
     JOIN repositories r ON r.domain_id = d.id
     JOIN scan_runs sr ON sr.repository_id = r.id
     WHERE sr.id = $1`,
    [scanRunId]
  );
}

export async function quickStartDiagnosis(input: {
  name: string;
  description?: string;
  repo_name: string;
  solution_path: string;
}): Promise<{ domain: DiagnosisDomain; repository: Repository }> {
  const existing = await findDomainByName(input.name);
  if (existing) {
    const err = new Error("DOMAIN_EXISTS");
    throw err;
  }

  const domain = await createDomain(input.name, input.description);
  const repository = await createRepository({
    domain_id: domain.id,
    name: input.repo_name,
    solution_path: input.solution_path,
    source_type: "local",
  });

  return { domain, repository };
}

export async function getDomainProgress(domainId: string): Promise<{
  hasRepository: boolean;
  hasScan: boolean;
  hasDiagnosis: boolean;
  latestScanId: string | null;
  latestRepositoryId: string | null;
  latestRepository: Repository | null;
  repositoryCount: number;
  scanCount: number;
  reportCount: number;
}> {
  const repositories = await listRepositoriesByDomain(domainId);
  const scans = await listScanRunsByDomain(domainId);
  const completedScans = scans.filter((s) => s.status === "completed");

  const reportRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM diagnostic_reports dr
     JOIN scan_runs sr ON sr.id = dr.scan_run_id
     JOIN repositories r ON r.id = sr.repository_id
     WHERE r.domain_id = $1 AND dr.status IN ('completed', 'partial')`,
    [domainId]
  );

  return {
    hasRepository: repositories.length > 0,
    hasScan: completedScans.length > 0,
    hasDiagnosis: Number(reportRow?.count ?? 0) > 0,
    latestScanId: completedScans[0]?.id ?? null,
    latestRepositoryId: repositories[0]?.id ?? null,
    latestRepository: repositories[0] ?? null,
    repositoryCount: repositories.length,
    scanCount: completedScans.length,
    reportCount: Number(reportRow?.count ?? 0),
  };
}
