import { describe, it, expect, beforeAll } from "vitest";
import { GET as getReport } from "@/app/api/v1/reports/[id]/route";
import { apiRequest, routeContext, NON_EXISTENT_ID } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";
import { createTestFixtures } from "../helpers/fixtures";

describe("GET /api/v1/reports/:id", () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  it("success: returns diagnostic report", async () => {
    const fixtures = await createTestFixtures();
    expect(fixtures.reportId).toBeTruthy();

    const res = await getReport(
      apiRequest("GET", `/api/v1/reports/${fixtures.reportId}`),
      routeContext({ id: fixtures.reportId })
    );
    const body = await expectJson<{ report: { id: string; status: string } }>(res, 200);
    expect(body.report.id).toBe(fixtures.reportId);
    expect(body.report.status).toBeTruthy();
  });

  it("error: nonexistent report returns 404", async () => {
    const res = await getReport(
      apiRequest("GET", `/api/v1/reports/${NON_EXISTENT_ID}`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});
