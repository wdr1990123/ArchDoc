import { describe, it, expect, beforeAll } from "vitest";
import { GET as getJob } from "@/app/api/v1/jobs/[id]/route";
import { GET as pollJobsGet, POST as pollJobsPost } from "@/app/api/v1/jobs/poll/route";
import { apiRequest, routeContext, NON_EXISTENT_ID } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";
import { createTestFixtures } from "../helpers/fixtures";

describe("GET /api/v1/jobs/:id", () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  it("success: returns job details", async () => {
    const fixtures = await createTestFixtures();
    const res = await getJob(
      apiRequest("GET", `/api/v1/jobs/${fixtures.jobId}`),
      routeContext({ id: fixtures.jobId })
    );
    const body = await expectJson<{ job: { id: string; kind: string } }>(res, 200);
    expect(body.job.id).toBe(fixtures.jobId);
    expect(body.job.kind).toBe("ai_diagnose");
  });

  it("error: nonexistent job returns 404", async () => {
    const res = await getJob(
      apiRequest("GET", `/api/v1/jobs/${NON_EXISTENT_ID}`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});

describe("POST /api/v1/jobs/poll", () => {
  it("success: polls pending jobs", async () => {
    const res = await pollJobsPost(apiRequest("POST", "/api/v1/jobs/poll"));
    const body = await expectJson<{ processed: number }>(res, 200);
    expect(typeof body.processed).toBe("number");
  });

  it("error: missing API key returns 401", async () => {
    const res = await pollJobsPost(
      apiRequest("POST", "/api/v1/jobs/poll", { apiKey: false })
    );
    await expectError(res, 401);
  });
});

describe("GET /api/v1/jobs/poll", () => {
  it("success: polls without authentication", async () => {
    const res = await pollJobsGet();
    const body = await expectJson<{ processed: number }>(res, 200);
    expect(typeof body.processed).toBe("number");
  });
});
