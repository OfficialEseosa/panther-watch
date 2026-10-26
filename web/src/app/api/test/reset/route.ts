import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { guarded, rowsOf } from "../_lib/guard";

/**
 * POST /api/test/reset (e2e only; header x-e2e-secret) -> 200 { truncated: string[] }.
 * Empties every table in `public` (tables added by later migrations included) and restarts
 * identity sequences. Drizzle's migration bookkeeping lives in the `drizzle` schema and is kept.
 */
export async function POST(request: Request): Promise<Response> {
  return guarded(request, async () => {
    const db = getDb();
    const tables = rowsOf<{ name: string }>(
      await db.execute(sql`SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`),
    ).map((row) => row.name);
    if (tables.length > 0) {
      await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
    }
    return Response.json({ truncated: tables });
  });
}
