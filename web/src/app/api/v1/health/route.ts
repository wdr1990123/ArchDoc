import { checkDbConnection } from "@/lib/db/client";
import { jsonOk } from "@/lib/api/helpers";

export async function GET() {
  const dbOk = await checkDbConnection().catch(() => false);
  return jsonOk({
    status: dbOk ? "ok" : "degraded",
    db: dbOk,
    timestamp: new Date().toISOString(),
  });
}
