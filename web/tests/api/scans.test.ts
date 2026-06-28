import { describe, it, expect, beforeAll } from "vitest";
import { POST as uploadScan } from "@/app/api/v1/scans/upload/route";
import { GET as getScan } from "@/app/api/v1/scans/[id]/route";
import { GET as getScanGraph } from "@/app/api/v1/scans/[id]/graph/route";
import { GET as getScanIssues } from "@/app/api/v1/scans/[id]/issues/route";
import { POST as diagnoseScan } from "@/app/api/v1/scans/[id]/diagnose/route";
import { apiRequest, routeContext, NON_EXISTENT_ID } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";
import { buildScanPayload, createTestFixtures } from "../helpers/fixtures";

describe("POST /api/v1/scans/upload", () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  it("success: uploads scan result", async () => {
    const fixtures = await createTestFixtures();
    const res = await uploadScan(
      apiRequest("POST", "/api/v1/scans/upload", {
        body: buildScanPayload(fixtures.repositoryId, `upload-${Date.now()}`),
      })
    );
    const body = await expectJson<{ scan_run_id: string }>(res, 201);
    expect(body.scan_run_id).toBeTruthy();
  });

  it("error: missing API key returns 401", async () => {
    const res = await uploadScan(
      apiRequest("POST", "/api/v1/scans/upload", {
        apiKey: false,
        body: { repository_id: "x", modules: [] },
      })
    );
    await expectError(res, 401);
  });

  it("error: missing modules returns 400", async () => {
    const fixtures = await createTestFixtures();
    const res = await uploadScan(
      apiRequest("POST", "/api/v1/scans/upload", {
        body: { repository_id: fixtures.repositoryId, modules: [] },
      })
    );
    await expectError(res, 400, "modules");
  });
});

describe("GET /api/v1/scans/:id", () => {
  it("success: returns scan detail with overview", async () => {
    const fixtures = await createTestFixtures();
    const res = await getScan(
      apiRequest("GET", `/api/v1/scans/${fixtures.scanRunId}`),
      routeContext({ id: fixtures.scanRunId })
    );
    const body = await expectJson<{
      scan: { id: string };
      overview: unknown;
      repository: unknown;
      domain: unknown;
    }>(res, 200);

    expect(body.scan.id).toBe(fixtures.scanRunId);
    expect(body.overview).toBeDefined();
  });

  it("error: nonexistent scan returns 404", async () => {
    const res = await getScan(
      apiRequest("GET", `/api/v1/scans/${NON_EXISTENT_ID}`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});

describe("GET /api/v1/scans/:id/graph", () => {
  it("success: returns dependency graph", async () => {
    const fixtures = await createTestFixtures();
    const res = await getScanGraph(
      apiRequest("GET", `/api/v1/scans/${fixtures.scanRunId}/graph`),
      routeContext({ id: fixtures.scanRunId })
    );
    const body = await expectJson<{ nodes: unknown[]; edges: unknown[] }>(res, 200);
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  it("error: nonexistent scan returns 404", async () => {
    const res = await getScanGraph(
      apiRequest("GET", `/api/v1/scans/${NON_EXISTENT_ID}/graph`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});

describe("GET /api/v1/scans/:id/issues", () => {
  it("success: returns issues and modules", async () => {
    const fixtures = await createTestFixtures();
    const res = await getScanIssues(
      apiRequest("GET", `/api/v1/scans/${fixtures.scanRunId}/issues`),
      routeContext({ id: fixtures.scanRunId })
    );
    const body = await expectJson<{ issues: unknown[]; modules: unknown[] }>(res, 200);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(Array.isArray(body.modules)).toBe(true);
  });

  it("error: nonexistent scan returns 404", async () => {
    const res = await getScanIssues(
      apiRequest("GET", `/api/v1/scans/${NON_EXISTENT_ID}/issues`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});

describe("POST /api/v1/scans/:id/diagnose", () => {
  it("success: enqueues diagnosis and returns job id", async () => {
    const fixtures = await createTestFixtures();
    const res = await diagnoseScan(
      apiRequest("POST", `/api/v1/scans/${fixtures.scanRunId}/diagnose`),
      routeContext({ id: fixtures.scanRunId })
    );
    const body = await expectJson<{ job_id: string; message: string }>(res, 202);
    expect(body.job_id).toBeTruthy();
    expect(body.message).toContain("Diagnosis");
  });

  it("error: missing API key returns 401", async () => {
    const fixtures = await createTestFixtures();
    const res = await diagnoseScan(
      apiRequest("POST", `/api/v1/scans/${fixtures.scanRunId}/diagnose`, { apiKey: false }),
      routeContext({ id: fixtures.scanRunId })
    );
    await expectError(res, 401);
  });

  it("error: nonexistent scan returns 404", async () => {
    const res = await diagnoseScan(
      apiRequest("POST", `/api/v1/scans/${NON_EXISTENT_ID}/diagnose`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});
