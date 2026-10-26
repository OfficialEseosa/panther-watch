import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as courseMeta from "@/db/schema/course-meta";
import type { CourseMetaDb } from "../db";

export interface TestDb {
  db: CourseMetaDb;
  client: PGlite;
  /** Empties every course-meta table. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

let ddl: string[] | undefined;

/**
 * CREATE statements for the course-meta tables, generated in memory by drizzle-kit's
 * programmatic API (the same diff `drizzle-kit generate` writes to a migration file, but
 * nothing touches web/drizzle or a real database).
 */
export async function courseMetaDdl(): Promise<string[]> {
  if (!ddl) {
    const empty = generateDrizzleJson({});
    const current = generateDrizzleJson(courseMeta, empty.id);
    ddl = await generateMigration(empty, current);
  }
  return ddl;
}

/** A fresh in-memory Postgres (PGlite) with the course-meta tables created. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  for (const statement of await courseMetaDdl()) await client.exec(statement);
  const db: CourseMetaDb = drizzle(client);
  return {
    db,
    client,
    reset: async () => {
      await client.exec("TRUNCATE section_grades, grade_terms, syllabi, rmp_cache");
    },
    close: () => client.close(),
  };
}
