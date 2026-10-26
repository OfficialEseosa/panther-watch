import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

// Read lazily by @/lib/env on first use, after tests/setup.ts has reset the env.
process.env.ADMIN_EMAILS = "Admin@PantherWatch.test, other-admin@pantherwatch.test";

import { setDbForTests } from "@/db";
import { announcements, type User } from "@/db/schema";
import { GET as adminList, POST as adminCreate } from "@/app/api/admin/announcements/route";
import { DELETE as adminDelete, PATCH as adminPatch } from "@/app/api/admin/announcements/[id]/route";
import { GET as publicList } from "@/app/api/announcements/route";
import { listActive } from "@/lib/announcements";
import { apiRequest, call, params } from "../helpers/session";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

let testDb: TestDatabase;
let admin: User;
let student: User;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
});
afterAll(async () => {
  setDbForTests(undefined);
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  admin = await seedUser(testDb.db, { email: "admin@pantherwatch.test", name: "Admin" });
  student = await seedUser(testDb.db, { email: "student@student.gsu.test" });
});

async function seed(values: Partial<typeof announcements.$inferInsert> & { message: string }) {
  const [row] = await testDb.db
    .insert(announcements)
    .values({ startsAt: ago(HOUR), createdBy: admin.id, ...values })
    .returning();
  return row;
}

async function publicIds(): Promise<number[]> {
  const response = await call(publicList, await apiRequest("/api/announcements"));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { announcements: Array<{ id: number }> };
  return body.announcements.map((a) => a.id);
}

describe("GET /api/announcements (public)", () => {
  it("returns only announcements that are active, started and not expired, newest first", async () => {
    const older = await seed({ message: "Older, no expiry", startsAt: ago(3 * HOUR) });
    const newer = await seed({ message: "Newer, expires later", startsAt: ago(HOUR), expiresAt: ahead(HOUR) });
    await seed({ message: "Scheduled", startsAt: ahead(HOUR) });
    // Like the one live row in prod: expired but still active=true.
    await seed({ message: "Expired", startsAt: ago(5 * HOUR), expiresAt: ago(HOUR), active: true });
    await seed({ message: "Inactive", active: false });

    const response = await call(publicList, await apiRequest("/api/announcements"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
    const body = await response.json();
    expect(body).toEqual({
      announcements: [
        {
          id: newer.id,
          message: "Newer, expires later",
          level: "info",
          startsAt: newer.startsAt.toISOString(),
          expiresAt: newer.expiresAt!.toISOString(),
        },
        { id: older.id, message: "Older, no expiry", level: "info", startsAt: older.startsAt.toISOString(), expiresAt: null },
      ],
    });
  });

  it("listActive(now) honours the instant it is given", async () => {
    const row = await seed({ message: "Window", startsAt: new Date("2026-10-01T12:00:00Z"), expiresAt: new Date("2026-10-02T12:00:00Z") });
    expect(await listActive(new Date("2026-10-01T11:59:59Z"))).toEqual([]);
    expect((await listActive(new Date("2026-10-01T12:00:00Z"))).map((a) => a.id)).toEqual([row.id]);
    expect(await listActive(new Date("2026-10-02T12:00:00Z"))).toEqual([]);
  });
});

describe("admin announcement routes: access", () => {
  it("401 when signed out", async () => {
    expect((await call(adminList, await apiRequest("/api/admin/announcements"))).status).toBe(401);
    const create = await call(
      adminCreate,
      await apiRequest("/api/admin/announcements", { method: "POST", body: { message: "x" } }),
    );
    expect(create.status).toBe(401);
    expect(await create.json()).toEqual({ error: { code: "unauthorized", message: "Sign in required" } });
  });

  it("404 (not 403) for a signed-in non-admin, and nothing changes", async () => {
    const row = await seed({ message: "Keep me" });
    const as = student;
    const responses = [
      await call(adminList, await apiRequest("/api/admin/announcements", { as })),
      await call(adminCreate, await apiRequest("/api/admin/announcements", { method: "POST", as, body: { message: "Hi" } })),
      await call(
        adminPatch,
        await apiRequest(`/api/admin/announcements/${row.id}`, { method: "PATCH", as, body: { active: false } }),
        params({ id: String(row.id) }),
      ),
      await call(
        adminDelete,
        await apiRequest(`/api/admin/announcements/${row.id}`, { method: "DELETE", as }),
        params({ id: String(row.id) }),
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
    }
    const [still] = await testDb.db.select().from(announcements);
    expect(still).toMatchObject({ id: row.id, active: true });
  });

  it("403 for a mutation without Origin, even from an admin", async () => {
    const response = await call(
      adminCreate,
      await apiRequest("/api/admin/announcements", { method: "POST", as: admin, origin: null, body: { message: "Hi" } }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
    expect(await testDb.db.select().from(announcements)).toHaveLength(0);
  });

  it("403 for a cross-site Origin", async () => {
    const response = await call(
      adminCreate,
      await apiRequest("/api/admin/announcements", { method: "POST", as: admin, origin: "https://evil.test", body: { message: "Hi" } }),
    );
    expect(response.status).toBe(403);
  });
});

describe("admin announcement lifecycle", () => {
  it("create -> public, deactivate -> hidden, reactivate -> back, delete -> gone", async () => {
    const created = await call(
      adminCreate,
      await apiRequest("/api/admin/announcements", {
        method: "POST",
        as: admin,
        body: { message: "  Registration opens Monday  ", level: "warning", expiresAt: ahead(24 * HOUR).toISOString() },
      }),
    );
    expect(created.status).toBe(201);
    const { announcement } = await created.json();
    expect(announcement).toMatchObject({
      message: "Registration opens Monday",
      level: "warning",
      active: true,
      live: true,
      createdBy: { id: admin.id, email: admin.email, name: "Admin" },
    });
    expect(await publicIds()).toEqual([announcement.id]);

    const id = String(announcement.id);
    const off = await call(
      adminPatch,
      await apiRequest(`/api/admin/announcements/${id}`, { method: "PATCH", as: admin, body: { active: false } }),
      params({ id }),
    );
    expect(off.status).toBe(200);
    expect((await off.json()).announcement).toMatchObject({ active: false, live: false, message: "Registration opens Monday" });
    expect(await publicIds()).toEqual([]);

    const on = await call(
      adminPatch,
      await apiRequest(`/api/admin/announcements/${id}`, { method: "PATCH", as: admin, body: { active: true, message: "Edited" } }),
      params({ id }),
    );
    expect((await on.json()).announcement).toMatchObject({ active: true, message: "Edited" });
    expect(await publicIds()).toEqual([announcement.id]);

    const list = await call(adminList, await apiRequest("/api/admin/announcements", { as: admin }));
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect((await list.json()).announcements).toHaveLength(1);

    const deleted = await call(
      adminDelete,
      await apiRequest(`/api/admin/announcements/${id}`, { method: "DELETE", as: admin }),
      params({ id }),
    );
    expect(deleted.status).toBe(204);
    expect(await publicIds()).toEqual([]);
    const again = await call(
      adminDelete,
      await apiRequest(`/api/admin/announcements/${id}`, { method: "DELETE", as: admin }),
      params({ id }),
    );
    expect(again.status).toBe(404);
  });

  it("the admin list includes scheduled, expired and inactive rows", async () => {
    await seed({ message: "Live" });
    await seed({ message: "Scheduled", startsAt: ahead(HOUR) });
    await seed({ message: "Expired", startsAt: ago(2 * HOUR), expiresAt: ago(HOUR) });
    await seed({ message: "Inactive", active: false });
    const response = await call(adminList, await apiRequest("/api/admin/announcements", { as: admin }));
    const { announcements: rows } = (await response.json()) as { announcements: Array<{ message: string; live: boolean }> };
    expect(rows.map((r) => [r.message, r.live]).sort()).toEqual([
      ["Expired", false],
      ["Inactive", false],
      ["Live", true],
      ["Scheduled", false],
    ]);
  });

  it("stores an offset time as the right instant (no local-time drift)", async () => {
    const response = await call(
      adminCreate,
      await apiRequest("/api/admin/announcements", {
        method: "POST",
        as: admin,
        body: { message: "tz", startsAt: "2026-10-25T14:00:00-04:00", expiresAt: "2026-10-25T20:00:00-04:00" },
      }),
    );
    expect(response.status).toBe(201);
    const { announcement } = await response.json();
    expect(announcement.startsAt).toBe("2026-10-25T18:00:00.000Z");
    expect(announcement.expiresAt).toBe("2026-10-26T00:00:00.000Z");
    const [row] = await testDb.db.select().from(announcements).where(eq(announcements.id, announcement.id));
    expect(row.expiresAt!.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("PATCH/DELETE of a missing or malformed id is 404", async () => {
    for (const id of ["999", "abc", "0", "-1", "1.5"]) {
      const response = await call(
        adminPatch,
        await apiRequest(`/api/admin/announcements/${id}`, { method: "PATCH", as: admin, body: { active: false } }),
        params({ id }),
      );
      expect(response.status, id).toBe(404);
    }
  });
});

describe("admin announcement validation (400)", () => {
  async function post(body: unknown) {
    return call(adminCreate, await apiRequest("/api/admin/announcements", { method: "POST", as: admin, body }));
  }

  it.each([
    ["empty message", { message: "" }],
    ["blank message", { message: "    " }],
    ["message over 500 chars", { message: "x".repeat(501) }],
    ["unknown level", { message: "Hi", level: "critical" }],
    ["expires before start", { message: "Hi", startsAt: "2026-11-02T12:00:00Z", expiresAt: "2026-11-01T12:00:00Z" }],
    ["expires equal to start", { message: "Hi", startsAt: "2026-11-02T12:00:00Z", expiresAt: "2026-11-02T12:00:00Z" }],
    ["expires in the past (start defaults to now)", { message: "Hi", expiresAt: "2020-01-01T00:00:00Z" }],
    ["naive local time without offset", { message: "Hi", expiresAt: "2026-11-02T12:00" }],
    ["mass-assigned field", { message: "Hi", createdBy: "someone-else" }],
    ["non-object body", ["Hi"]],
  ])("%s", async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("invalid_request");
    expect(typeof error.message).toBe("string");
    expect(await testDb.db.select().from(announcements)).toHaveLength(0);
  });

  it("malformed JSON", async () => {
    const response = await post("{not json");
    expect(response.status).toBe(400);
  });

  it("PATCH checks the expiry against the stored start, and an empty patch", async () => {
    const row = await seed({ message: "Hi", startsAt: new Date("2026-11-02T12:00:00Z") });
    const id = String(row.id);
    for (const body of [{ expiresAt: "2026-11-01T00:00:00Z" }, {}, { message: " " }]) {
      const response = await call(
        adminPatch,
        await apiRequest(`/api/admin/announcements/${id}`, { method: "PATCH", as: admin, body }),
        params({ id }),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    const [unchanged] = await testDb.db.select().from(announcements);
    expect(unchanged.expiresAt).toBeNull();
    expect(unchanged.message).toBe("Hi");
  });

  it("PATCH expiresAt: null clears the expiry", async () => {
    const row = await seed({ message: "Hi", expiresAt: ahead(HOUR) });
    const id = String(row.id);
    const response = await call(
      adminPatch,
      await apiRequest(`/api/admin/announcements/${id}`, { method: "PATCH", as: admin, body: { expiresAt: null } }),
      params({ id }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).announcement.expiresAt).toBeNull();
  });
});
