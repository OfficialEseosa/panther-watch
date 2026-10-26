import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { setDbForTests } from "@/db";
import { emailLog, scheduleEntries, terms, users, watchedSections, type User } from "@/db/schema";
import { DELETE as accountDelete } from "@/app/api/account/route";
import { GET as watchesGet } from "@/app/api/watches/route";
import { deleteAccount } from "@/lib/account";
import { createMemoryTransport, setDefaultEmailTransport, type MemoryTransport } from "@/lib/email";
import { createTestDb, seedUser, seedWatchedSection, truncateAll, type TestDatabase } from "../helpers/db";
import { apiRequest, call, sessionCookie } from "../helpers/session";

let testDb: TestDatabase;
let mail: MemoryTransport;
let alice: User;
let bob: User;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  mail = createMemoryTransport();
  setDefaultEmailTransport(mail);
});
afterAll(async () => {
  setDefaultEmailTransport(null);
  setDbForTests(undefined);
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  mail.clear();
  await testDb.db.insert(terms).values({ code: "202701", description: "Spring Semester 2027", viewOnly: false });
  alice = await seedUser(testDb.db, { name: "Alice Panther", email: "alice@student.gsu.test" });
  bob = await seedUser(testDb.db);
  await seedWatchedSection(testDb.db, alice.id, { term: "202701", crn: "80001" });
  await seedWatchedSection(testDb.db, alice.id, { term: "202701", crn: "80002" });
  await seedWatchedSection(testDb.db, bob.id, { term: "202701", crn: "80001" });
  await testDb.db.insert(scheduleEntries).values({
    userId: alice.id,
    term: "202701",
    crn: "80001",
    subject: "CSC",
    courseNumber: "1301",
  });
});

describe("DELETE /api/account", () => {
  it("deletes the user and their data, sends the goodbye email and revokes the session", async () => {
    const cookie = await sessionCookie(alice);
    const response = await call(accountDelete, await apiRequest("/api/account", { method: "DELETE", cookie }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    // The session cookie is cleared.
    expect(response.headers.get("set-cookie")).toMatch(/pw_session=;.*Max-Age=0/i);

    expect(await testDb.db.select().from(users).where(eq(users.id, alice.id))).toEqual([]);
    expect(await testDb.db.select().from(watchedSections).where(eq(watchedSections.userId, alice.id))).toEqual([]);
    expect(await testDb.db.select().from(scheduleEntries).where(eq(scheduleEntries.userId, alice.id))).toEqual([]);
    // Other users are untouched.
    expect(await testDb.db.select().from(watchedSections).where(eq(watchedSections.userId, bob.id))).toHaveLength(1);

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("alice@student.gsu.test");
    const [logged] = await testDb.db.select().from(emailLog);
    expect(logged).toMatchObject({
      userId: null,
      recipient: "alice@student.gsu.test",
      type: "goodbye",
      subject: mail.sent[0].subject,
      providerMessageId: mail.sent[0].id,
    });

    // The old (still cryptographically valid) cookie no longer authenticates.
    const after = await call(watchesGet, await apiRequest("/api/watches", { cookie }));
    expect(after.status).toBe(401);
    const again = await call(accountDelete, await apiRequest("/api/account", { method: "DELETE", cookie }));
    expect(again.status).toBe(401);
  });

  it("still deletes the account when the goodbye email fails", async () => {
    mail.failNext("provider down");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await call(accountDelete, await apiRequest("/api/account", { method: "DELETE", as: alice }));
      expect(response.status).toBe(200);
    } finally {
      errors.mockRestore();
    }
    expect(await testDb.db.select().from(users).where(eq(users.id, alice.id))).toEqual([]);
    expect(await testDb.db.select().from(emailLog)).toEqual([]);
  });

  it("requires a session and same origin", async () => {
    expect((await call(accountDelete, await apiRequest("/api/account", { method: "DELETE" }))).status).toBe(401);
    const crossOrigin = await call(accountDelete, await apiRequest("/api/account", { method: "DELETE", as: alice, origin: null }));
    expect(crossOrigin.status).toBe(403);
    expect(await testDb.db.select().from(users).where(eq(users.id, alice.id))).toHaveLength(1);
  });
});

describe("deleteAccount()", () => {
  it("uses the transport it is given and reports a missing user", async () => {
    const own = createMemoryTransport();
    await expect(deleteAccount(alice.id, { transport: own, appUrl: "https://pantherwatch.test" })).resolves.toEqual({
      deleted: true,
      goodbyeSent: true,
    });
    expect(own.sent).toHaveLength(1);
    expect(mail.sent).toHaveLength(0);
    await expect(deleteAccount(alice.id, { transport: own })).resolves.toEqual({ deleted: false, goodbyeSent: false });
    expect(own.sent).toHaveLength(1);
  });
});
