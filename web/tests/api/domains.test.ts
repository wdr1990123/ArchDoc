import { describe, it, expect, beforeAll } from "vitest";
import { GET as listDomains, POST as createDomain } from "@/app/api/v1/domains/route";
import { GET as getDomain, DELETE as deleteDomain } from "@/app/api/v1/domains/[id]/route";
import { apiRequest, routeContext, NON_EXISTENT_ID } from "../helpers/request";
import { expectError, expectJson } from "../helpers/assertions";
import { createTestFixtures } from "../helpers/fixtures";
import { TEST_CREATE_DESCRIPTION } from "../helpers/test-markers";

describe("GET /api/v1/domains", () => {
  beforeAll(async () => {
    await createTestFixtures();
  });

  it("success: returns domain list including fixture", async () => {
    const fixtures = await createTestFixtures();
    const res = await listDomains();
    const body = await expectJson<{ domains: { id: string }[] }>(res, 200);
    expect(body.domains.some((d) => d.id === fixtures.domainId)).toBe(true);
  });
});

describe("POST /api/v1/domains", () => {
  it("success: creates a new domain", async () => {
    const res = await createDomain(
      apiRequest("POST", "/api/v1/domains", {
        body: { name: `New Domain ${Date.now()}`, description: TEST_CREATE_DESCRIPTION },
      })
    );
    const body = await expectJson<{ domain: { id: string; name: string } }>(res, 201);
    expect(body.domain.id).toBeTruthy();
    expect(body.domain.name).toContain("New Domain");
  });

  it("error: missing API key returns 401", async () => {
    const res = await createDomain(
      apiRequest("POST", "/api/v1/domains", {
        apiKey: false,
        body: { name: "Should Fail" },
      })
    );
    await expectError(res, 401);
  });

  it("error: empty name returns 400", async () => {
    const res = await createDomain(
      apiRequest("POST", "/api/v1/domains", { body: { name: "   " } })
    );
    await expectError(res, 400, "name");
  });

  it("error: duplicate name returns 409", async () => {
    const name = `Dup Domain ${Date.now()}`;
    const first = await createDomain(
      apiRequest("POST", "/api/v1/domains", { body: { name } })
    );
    await expectJson(first, 201);

    const second = await createDomain(
      apiRequest("POST", "/api/v1/domains", { body: { name } })
    );
    await expectError(second, 409, "already exists");
  });
});

describe("GET /api/v1/domains/:id", () => {
  it("success: returns domain detail with related data", async () => {
    const fixtures = await createTestFixtures();
    const res = await getDomain(
      apiRequest("GET", `/api/v1/domains/${fixtures.domainId}`),
      routeContext({ id: fixtures.domainId })
    );
    const body = await expectJson<{
      domain: { id: string };
      repositories: unknown[];
      scanRuns: unknown[];
      snapshots: unknown[];
    }>(res, 200);

    expect(body.domain.id).toBe(fixtures.domainId);
    expect(Array.isArray(body.repositories)).toBe(true);
    expect(Array.isArray(body.scanRuns)).toBe(true);
    expect(Array.isArray(body.snapshots)).toBe(true);
  });

  it("error: nonexistent domain returns 404", async () => {
    const res = await getDomain(
      apiRequest("GET", `/api/v1/domains/${NON_EXISTENT_ID}`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});

describe("DELETE /api/v1/domains/:id", () => {
  it("success: deletes a domain", async () => {
    const name = `Delete Me ${Date.now()}`;
    const createRes = await createDomain(
      apiRequest("POST", "/api/v1/domains", { body: { name } })
    );
    const { domain } = await expectJson<{ domain: { id: string } }>(createRes, 201);

    const deleteRes = await deleteDomain(
      apiRequest("DELETE", `/api/v1/domains/${domain.id}`),
      routeContext({ id: domain.id })
    );
    await expectJson(deleteRes, 200);

    const getRes = await getDomain(
      apiRequest("GET", `/api/v1/domains/${domain.id}`),
      routeContext({ id: domain.id })
    );
    await expectError(getRes, 404, "not found");
  });

  it("error: missing API key returns 401", async () => {
    const res = await deleteDomain(
      apiRequest("DELETE", `/api/v1/domains/${NON_EXISTENT_ID}`, { apiKey: false }),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 401);
  });

  it("error: nonexistent domain returns 404", async () => {
    const res = await deleteDomain(
      apiRequest("DELETE", `/api/v1/domains/${NON_EXISTENT_ID}`),
      routeContext({ id: NON_EXISTENT_ID })
    );
    await expectError(res, 404, "not found");
  });
});
