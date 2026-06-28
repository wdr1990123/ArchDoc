import { describe, it, expect, beforeAll } from "vitest";
import {
  POST as createSnapshot,
  GET as getSnapshotGraph,
} from "@/app/api/v1/domains/[id]/snapshot/route";
import { apiRequest, routeContext, NON_EXISTENT_ID } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";
import { createTestFixtures } from "../helpers/fixtures";

describe("POST /api/v1/domains/:id/snapshot", () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  it("success: creates federation snapshot", async () => {
    const fixtures = await createTestFixtures();
    const res = await createSnapshot(
      apiRequest("POST", `/api/v1/domains/${fixtures.domainId}/snapshot`, {
        body: {
          name: `Extra Snapshot ${Date.now()}`,
          scan_run_ids: [fixtures.scanRunId],
        },
      }),
      routeContext({ id: fixtures.domainId })
    );
    const body = await expectJson<{ snapshot: { id: string } }>(res, 201);
    expect(body.snapshot.id).toBeTruthy();
  });

  it("error: missing API key returns 401", async () => {
    const fixtures = await createTestFixtures();
    const res = await createSnapshot(
      apiRequest("POST", `/api/v1/domains/${fixtures.domainId}/snapshot`, {
        apiKey: false,
        body: { name: "x", scan_run_ids: [fixtures.scanRunId] },
      }),
      routeContext({ id: fixtures.domainId })
    );
    await expectError(res, 401);
  });

  it("error: missing name returns 400", async () => {
    const fixtures = await createTestFixtures();
    const res = await createSnapshot(
      apiRequest("POST", `/api/v1/domains/${fixtures.domainId}/snapshot`, {
        body: { scan_run_ids: [fixtures.scanRunId] },
      }),
      routeContext({ id: fixtures.domainId })
    );
    await expectError(res, 400, "name");
  });

  it("error: nonexistent domain returns 404", async () => {
    const res = await createSnapshot(
      apiRequest("POST", `/api/v1/domains/${NON_EXISTENT_ID}/snapshot`, {
        body: { name: "Ghost", scan_run_ids: ["00000000-0000-0000-0000-000000000001"] },
      }),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});

describe("GET /api/v1/domains/:id/snapshot", () => {
  it("success: returns federation graph for snapshot", async () => {
    const fixtures = await createTestFixtures();
    const res = await getSnapshotGraph(
      apiRequest("GET", `/api/v1/domains/${fixtures.domainId}/snapshot`, {
        searchParams: { snapshot_id: fixtures.snapshotId },
      })
    );
    const body = await expectJson<{ snapshot: unknown; nodes: unknown[]; edges: unknown[] }>(
      res,
      200
    );
    expect(body.snapshot).toBeDefined();
    expect(Array.isArray(body.nodes)).toBe(true);
  });

  it("error: missing snapshot_id returns 400", async () => {
    const res = await getSnapshotGraph(
      apiRequest("GET", "/api/v1/domains/any-id/snapshot")
    );
    await expectError(res, 400, "snapshot_id");
  });

  it("error: nonexistent snapshot returns 404", async () => {
    const res = await getSnapshotGraph(
      apiRequest("GET", "/api/v1/domains/any-id/snapshot", {
        searchParams: { snapshot_id: NON_EXISTENT_ID },
      })
    );
    await expectError(res, 404, "not found");
  });
});
