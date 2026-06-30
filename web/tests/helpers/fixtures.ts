import { randomUUID } from "crypto";
import { POST as createDomain } from "@/app/api/v1/domains/route";
import { POST as createRepository } from "@/app/api/v1/repositories/route";
import { POST as uploadScan } from "@/app/api/v1/scans/upload/route";
import { POST as createSnapshot } from "@/app/api/v1/domains/[id]/snapshot/route";
import { POST as diagnoseScan } from "@/app/api/v1/scans/[id]/diagnose/route";
import {
  TEST_CREATE_DESCRIPTION,
  TEST_DOMAIN_DESCRIPTION,
} from "./test-markers";
import type { ScanResultPayload } from "@/lib/types";
import { apiRequest, routeContext } from "./request";
import { getJob, getReportsForScan } from "@/lib/jobs/reportPersist";

export interface TestFixtures {
  suffix: string;
  domainId: string;
  repositoryId: string;
  scanRunId: string;
  snapshotId: string;
  jobId: string;
  reportId: string;
}

let cachedFixtures: TestFixtures | null = null;

export function buildScanPayload(repositoryId: string, suffix: string): ScanResultPayload {
  const moduleId = `mod-${suffix}`;
  return {
    schema_version: "1.0",
    repository_id: repositoryId,
    solution_path: `D:/test/${suffix}/Sample.sln`,
    scanned_at: new Date().toISOString(),
    modules: [{ id: moduleId, name: `Sample.Module.${suffix}`, kind: "project", loc: 100 }],
    dependencies: [],
    metrics: [{ module_id: moduleId, code: "ce", value: 5 }],
    issues: [
      {
        rule_id: "test-rule",
        severity: "medium",
        module_ids: [moduleId],
        message: `Test issue ${suffix}`,
      },
    ],
  };
}

export async function createTestFixtures(): Promise<TestFixtures> {
  if (cachedFixtures) return cachedFixtures;

  const suffix = `test-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const domainRes = await createDomain(
    apiRequest("POST", "/api/v1/domains", {
      body: { name: `API Test Domain ${suffix}`, description: TEST_DOMAIN_DESCRIPTION },
    })
  );
  const domainBody = (await domainRes.json()) as {
    domain?: { id: string };
    error?: string;
  };
  if (!domainRes.ok || !domainBody.domain) {
    throw new Error(
      `Failed to create test domain: ${domainBody.error ?? domainRes.status}`
    );
  }
  const domainId = domainBody.domain.id;

  const repoRes = await createRepository(
    apiRequest("POST", "/api/v1/repositories", {
      body: {
        domain_id: domainId,
        name: `API Test Repo ${suffix}`,
        source_type: "local",
        solution_path: `D:/test/${suffix}/Sample.sln`,
      },
    })
  );
  const repoBody = (await repoRes.json()) as { repository: { id: string } };
  const repositoryId = repoBody.repository.id;

  const scanRes = await uploadScan(
    apiRequest("POST", "/api/v1/scans/upload", {
      body: buildScanPayload(repositoryId, suffix),
    })
  );
  const scanBody = (await scanRes.json()) as { scan_run_id: string };
  const scanRunId = scanBody.scan_run_id;

  const snapshotRes = await createSnapshot(
    apiRequest("POST", `/api/v1/domains/${domainId}/snapshot`, {
      body: { name: `Snapshot ${suffix}`, scan_run_ids: [scanRunId] },
    }),
    routeContext({ id: domainId })
  );
  const snapshotBody = (await snapshotRes.json()) as { snapshot: { id: string } };
  const snapshotId = snapshotBody.snapshot.id;

  const diagnoseRes = await diagnoseScan(
    apiRequest("POST", `/api/v1/scans/${scanRunId}/diagnose`, {
      headers: { "X-Diagnose-Sync": "true" },
    }),
    routeContext({ id: scanRunId })
  );
  const diagnoseBody = (await diagnoseRes.json()) as {
    job_id: string;
    report_id?: string;
    error?: string;
  };
  if (!diagnoseRes.ok) {
    throw new Error(
      `Failed to run sync diagnose: ${diagnoseBody.error ?? diagnoseRes.status}`
    );
  }

  let reportId = diagnoseBody.report_id ?? "";
  if (!reportId && diagnoseBody.job_id) {
    const job = await getJob(diagnoseBody.job_id);
    const result =
      typeof job?.result === "string"
        ? (JSON.parse(job.result) as { report_id?: string })
        : (job?.result as { report_id?: string } | undefined);
    reportId = result?.report_id ?? "";
    if (!reportId && job?.status === "failed") {
      throw new Error(`Diagnose job failed: ${job.error_message ?? "unknown"}`);
    }
  }
  if (!reportId) {
    const reports = await getReportsForScan(scanRunId);
    reportId = reports.find((r) => r.report_type === "project")?.id ?? reports[0]?.id ?? "";
  }
  if (!reportId) {
    throw new Error("Sync diagnose completed without report_id");
  }

  cachedFixtures = {
    suffix,
    domainId,
    repositoryId,
    scanRunId,
    snapshotId,
    jobId: diagnoseBody.job_id,
    reportId,
  };

  return cachedFixtures;
}
