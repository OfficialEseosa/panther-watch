import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests } from "@/db";
import { users } from "@/db/schema";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../../../../tests/helpers/db";
import type { GoogleUserInfo } from "../google";
import { AccountConflictError, UnverifiedEmailError, upsertGoogleUser } from "../users";

const google = (overrides: Partial<GoogleUserInfo> = {}): GoogleUserInfo => ({
  sub: "oauth-sub-1",
  email: "panther@student.gsu.test",
  email_verified: true,
  name: "Pounce",
  picture: "https://lh3.googleusercontent.com/a/one",
  ...overrides,
});

describe("upsertGoogleUser", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDb();
    setDbForTests(testDb.db);
  });
  afterAll(async () => {
    setDbForTests(undefined);
    await testDb.close();
  });
  beforeEach(() => truncateAll(testDb.db));

  it("creates a new user", async () => {
    const { user, created } = await upsertGoogleUser(google());
    expect(created).toBe(true);
    expect(user).toMatchObject({
      email: "panther@student.gsu.test",
      name: "Pounce",
      pictureUrl: "https://lh3.googleusercontent.com/a/one",
      googleSub: "oauth-sub-1",
    });
  });

  it("refreshes email, name, picture and updated_at on a later sign-in", async () => {
    const first = await upsertGoogleUser(google());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await upsertGoogleUser(
      google({
        email: "renamed@student.gsu.test",
        name: "Pounce II",
        picture: "https://lh3.googleusercontent.com/a/two",
      }),
    );
    expect(second.created).toBe(false);
    expect(second.user).toMatchObject({
      id: first.user.id,
      email: "renamed@student.gsu.test",
      name: "Pounce II",
      pictureUrl: "https://lh3.googleusercontent.com/a/two",
    });
    expect(second.user.updatedAt.getTime()).toBeGreaterThan(first.user.updatedAt.getTime());
  });

  it("keeps the stored email when the new one is unverified or used by another account", async () => {
    const { user } = await upsertGoogleUser(google());
    await seedUser(testDb.db, { email: "taken@student.gsu.test" });

    const unverified = await upsertGoogleUser(
      google({ email: "new@student.gsu.test", email_verified: false, name: "N" }),
    );
    expect(unverified.user).toMatchObject({ id: user.id, email: "panther@student.gsu.test", name: "N" });

    const taken = await upsertGoogleUser(google({ email: "TAKEN@student.gsu.test" }));
    expect(taken.user).toMatchObject({ id: user.id, email: "panther@student.gsu.test" });
  });

  it("links a legacy row by email only while its google_sub is null", async () => {
    const legacy = await seedUser(testDb.db, { email: "old@student.gsu.test", googleSub: null });
    const linked = await upsertGoogleUser(google({ sub: "google-new", email: "OLD@student.gsu.test" }));
    expect(linked).toMatchObject({ created: false, user: { id: legacy.id, googleSub: "google-new" } });

    // The row is now bound; a second Google account with the same email must not take it.
    await expect(
      upsertGoogleUser(google({ sub: "google-attacker", email: "old@student.gsu.test" })),
    ).rejects.toBeInstanceOf(AccountConflictError);
    const [row] = await testDb.db.select().from(users).where(eq(users.id, legacy.id));
    expect(row.googleSub).toBe("google-new");
  });

  it("throws AccountConflictError when the email belongs to a different Google sub", async () => {
    await seedUser(testDb.db, { email: "bound@student.gsu.test", googleSub: "google-owner" });
    await expect(
      upsertGoogleUser(google({ sub: "google-other", email: "bound@student.gsu.test" })),
    ).rejects.toBeInstanceOf(AccountConflictError);
  });

  it("rejects an unverified email for new accounts and for linking", async () => {
    await expect(upsertGoogleUser(google({ email_verified: false }))).rejects.toBeInstanceOf(
      UnverifiedEmailError,
    );
    expect(await testDb.db.select().from(users)).toHaveLength(0);

    const legacy = await seedUser(testDb.db, { email: "legacy@student.gsu.test", googleSub: null });
    await expect(
      upsertGoogleUser(google({ email: "legacy@student.gsu.test", email_verified: false })),
    ).rejects.toBeInstanceOf(UnverifiedEmailError);
    const [row] = await testDb.db.select().from(users).where(eq(users.id, legacy.id));
    expect(row.googleSub).toBeNull();
  });

  it("survives a concurrent first sign-in without an error", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => upsertGoogleUser(google())));
    const ids = new Set(results.map((result) => result.user.id));
    expect(ids.size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await testDb.db.select().from(users)).toHaveLength(1);
  });

  it("survives a concurrent first link of a legacy row", async () => {
    const legacy = await seedUser(testDb.db, { email: "race@student.gsu.test", googleSub: null });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => upsertGoogleUser(google({ sub: "google-race", email: "race@student.gsu.test" }))),
    );
    expect(results.every((result) => result.user.id === legacy.id && !result.created)).toBe(true);
  });
});
