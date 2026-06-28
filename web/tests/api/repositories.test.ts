import { describe, it, expect, beforeAll } from "vitest";
import { POST as createRepository } from "@/app/api/v1/repositories/route";
import { apiRequest } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";
import { createTestFixtures } from "../helpers/fixtures";

describe("POST /api/v1/repositories", () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  it("success: creates a repository under domain", async () => {
    const fixtures = await createTestFixtures();
    const res = await createRepository(
      apiRequest("POST", "/api/v1/repositories", {
        body: {
          domain_id: fixtures.domainId,
          name: `Repo ${Date.now()}`,
          source_type: "local",
        },
      })
    );
    const body = await expectJson<{ repository: { id: string; domain_id: string } }>(res, 201);
    expect(body.repository.id).toBeTruthy();
    expect(body.repository.domain_id).toBe(fixtures.domainId);
  });

  it("error: missing API key returns 401", async () => {
    const res = await createRepository(
      apiRequest("POST", "/api/v1/repositories", {
        apiKey: false,
        body: { domain_id: "x", name: "x" },
      })
    );
    await expectError(res, 401);
  });

  it("error: missing required fields returns 400", async () => {
    const res = await createRepository(
      apiRequest("POST", "/api/v1/repositories", { body: { name: "Only Name" } })
    );
    await expectError(res, 400, "required");
  });
});
