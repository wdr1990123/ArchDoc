import { deleteDomain } from "@/lib/db/queries";
import { getPool, query } from "@/lib/db/client";
import {
  TEST_CREATE_DESCRIPTION,
  TEST_DOMAIN_DESCRIPTION,
  TEST_DOMAIN_NAME_PREFIXES,
} from "./test-markers";

function buildTestDomainWhereClause(): { sql: string; params: string[] } {
  const nameClauses = TEST_DOMAIN_NAME_PREFIXES.map(
    (_, i) => `name LIKE $${i + 3}`
  ).join(" OR ");
  const nameParams = TEST_DOMAIN_NAME_PREFIXES.map((p) => `${p}%`);

  return {
    sql: `description IN ($1, $2) OR ${nameClauses}`,
    params: [TEST_DOMAIN_DESCRIPTION, TEST_CREATE_DESCRIPTION, ...nameParams],
  };
}

export async function findTestDomainIds(): Promise<string[]> {
  const { sql, params } = buildTestDomainWhereClause();
  const rows = await query<{ id: string }>(
    `SELECT id FROM diagnosis_domains WHERE ${sql}`,
    params
  );
  return rows.map((r) => r.id);
}

export async function cleanupTestDomains(): Promise<number> {
  const ids = await findTestDomainIds();
  let deleted = 0;
  for (const id of ids) {
    if (await deleteDomain(id)) deleted++;
  }
  return deleted;
}

export async function closeTestDbPool(): Promise<void> {
  await getPool().end();
  global.pgPool = undefined;
}
