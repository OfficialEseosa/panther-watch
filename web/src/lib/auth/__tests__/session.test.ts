import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Read once by @/lib/env on first use, so it must be set before anything touches env.
process.env.ADMIN_EMAILS = "Admin@Student.gsu.test";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));

const { setDbForTests } = await import("@/db");
const { users } = await import("@/db/schema");
const { createTestDb, seedUser, truncateAll } = await import("../../../../tests/helpers/db");
const { sessionCookieName } = await import("../constants");
const { signSession } = await import("../jwt");
const { getCurrentUser, requireAdmin, requireUser } = await import("../session");

type TestDatabase = Awaited<ReturnType<typeof createTestDb>>;

async function signIn(user: { id: string; email: string }) {
  cookieJar.set(sessionCookieName(), await signSession({ sub: user.id, email: user.email, name: null, picture: null }));
}

describe("getCurrentUser / requireUser / requireAdmin", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDb();
    setDbForTests(testDb.db);
  });
  afterAll(async () => {
    setDbForTests(undefined);
    await testDb.close();
  });
  beforeEach(async () => {
    cookieJar.clear();
    await truncateAll(testDb.db);
  });

  it("returns null without a cookie", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("loads the user row for a valid token", async () => {
    const user = await seedUser(testDb.db);
    await signIn(user);
    await expect(getCurrentUser()).resolves.toMatchObject({ id: user.id, isAdmin: false });
    await expect(requireUser()).resolves.toMatchObject({ id: user.id });
  });

  it("treats a valid token for a deleted user as signed out (revocation)", async () => {
    const user = await seedUser(testDb.db);
    await signIn(user);
    await testDb.db.delete(users).where(eq(users.id, user.id));
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });

  it("returns null for a token whose subject is not a UUID", async () => {
    cookieJar.set(sessionCookieName(), await signSession({ sub: "not-a-uuid", email: "x@y.test", name: null, picture: null }));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("requireAdmin uses the row's current email, and 404s everyone else", async () => {
    const member = await seedUser(testDb.db);
    await signIn(member);
    await expect(requireAdmin()).rejects.toMatchObject({ digest: expect.stringContaining("404") });

    const admin = await seedUser(testDb.db, { email: "admin@student.gsu.test" });
    await signIn(admin);
    await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id, isAdmin: true });

    // Demoted by an email change: the old JWT still says admin@..., the row does not.
    await testDb.db.update(users).set({ email: "former@student.gsu.test" }).where(eq(users.id, admin.id));
    await expect(requireAdmin()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});
