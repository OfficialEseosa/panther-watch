import "server-only";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import { announcementLevel, announcements, users, type Announcement, type AnnouncementLevel } from "@/db/schema";
import { InvalidInputError, parseInput } from "@/lib/admin/errors";

/**
 * Site-wide banners.
 *
 * Times: `starts_at` / `expires_at` are `timestamptz` and travel as ISO-8601 strings WITH an
 * offset (`2026-10-25T18:00:00.000Z` or `2026-10-25T14:00:00-04:00`). A naive local time
 * (`2026-10-25T14:00`) is rejected, so the old backend's bug, where the admin form sent a
 * browser-local `LocalDateTime` that the UTC server compared with its own clock (expiring
 * Atlanta announcements 4-5 h early), cannot come back: the admin UI must send
 * `new Date(localInput).toISOString()` and every instant is unambiguous.
 */

export const ANNOUNCEMENT_LEVELS = announcementLevel.enumValues;
export const MESSAGE_MAX = 500;

/** What the public banner gets: no `active` flag, no author. */
export interface PublicAnnouncement {
  id: number;
  message: string;
  level: AnnouncementLevel;
  startsAt: string;
  expiresAt: string | null;
}

/** What the admin panel gets. */
export interface AdminAnnouncement extends PublicAnnouncement {
  active: boolean;
  /** Derived for display: active, started and not expired at read time. */
  live: boolean;
  createdAt: string;
  createdBy: { id: string; email: string; name: string | null } | null;
}

const instant = z.iso
  .datetime({ offset: true, message: "must be an ISO-8601 date-time with an offset or Z" })
  .transform((value) => new Date(value));

const message = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .max(MESSAGE_MAX, `must be at most ${MESSAGE_MAX} characters`);

const level = z.enum(ANNOUNCEMENT_LEVELS);

export const createAnnouncementSchema = z.strictObject({
  message,
  level: level.default("info"),
  startsAt: instant.optional(),
  expiresAt: instant.nullable().optional(),
});
export type CreateAnnouncementInput = z.input<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z
  .strictObject({
    message: message.optional(),
    level: level.optional(),
    startsAt: instant.optional(),
    /** `null` clears the expiry. */
    expiresAt: instant.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "nothing to update",
  });
export type UpdateAnnouncementInput = z.input<typeof updateAnnouncementSchema>;

function assertWindow(startsAt: Date, expiresAt: Date | null | undefined): void {
  if (expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
    throw new InvalidInputError("expiresAt: must be after startsAt");
  }
}

function isLive(row: Announcement, now: Date): boolean {
  return (
    row.active &&
    row.startsAt.getTime() <= now.getTime() &&
    (row.expiresAt === null || row.expiresAt.getTime() > now.getTime())
  );
}

function toPublic(row: Announcement): PublicAnnouncement {
  return {
    id: row.id,
    message: row.message,
    level: row.level,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

type Author = { id: string; email: string; name: string | null } | null;

function toAdmin(row: Announcement, author: Author, now = new Date()): AdminAnnouncement {
  return {
    ...toPublic(row),
    active: row.active,
    live: isLive(row, now),
    createdAt: row.createdAt.toISOString(),
    createdBy: author,
  };
}

const authorColumns = { id: users.id, email: users.email, name: users.name };

async function selectAdmin(db: Db, id?: number): Promise<AdminAnnouncement[]> {
  const rows = await db
    .select({ announcement: announcements, author: authorColumns })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.createdBy))
    .where(id === undefined ? undefined : eq(announcements.id, id))
    .orderBy(desc(announcements.createdAt), desc(announcements.id));
  const now = new Date();
  return rows.map((row) => toAdmin(row.announcement, row.author, now));
}

/** Announcements visible at `now`, newest start first. */
export async function listActive(now: Date = new Date()): Promise<PublicAnnouncement[]> {
  const rows = await getDb()
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.active, true),
        lte(announcements.startsAt, now),
        or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
      ),
    )
    .orderBy(desc(announcements.startsAt), desc(announcements.id));
  return rows.map(toPublic);
}

/** Every announcement (active, scheduled, expired, inactive), newest first, with its author. */
export function listAll(): Promise<AdminAnnouncement[]> {
  return selectAdmin(getDb());
}

export async function getAnnouncement(id: number): Promise<AdminAnnouncement | null> {
  const [row] = await selectAdmin(getDb(), id);
  return row ?? null;
}

/**
 * Creates an announcement authored by `adminUserId`. `startsAt` defaults to now (app clock),
 * `level` to "info". Throws `InvalidInputError` on bad input.
 */
export async function create(adminUserId: string, input: unknown): Promise<AdminAnnouncement> {
  const parsed = parseInput(createAnnouncementSchema, input);
  const startsAt = parsed.startsAt ?? new Date();
  assertWindow(startsAt, parsed.expiresAt);

  const db = getDb();
  const [row] = await db
    .insert(announcements)
    .values({
      message: parsed.message,
      level: parsed.level,
      active: true,
      startsAt,
      expiresAt: parsed.expiresAt ?? null,
      createdBy: adminUserId,
    })
    .returning({ id: announcements.id });
  const [created] = await selectAdmin(db, row.id);
  return created;
}

/**
 * Applies a partial update. Only the listed fields can change (no mass assignment of `id`,
 * `created_by`, `created_at`). The expiry check runs against the merged row. Returns null
 * when the id does not exist; throws `InvalidInputError` on bad input.
 */
export async function update(id: number, patch: unknown): Promise<AdminAnnouncement | null> {
  const parsed = parseInput(updateAnnouncementSchema, patch);
  const db = getDb();
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(announcements).where(eq(announcements.id, id)).for("update");
    if (!current) return false;
    const startsAt = parsed.startsAt ?? current.startsAt;
    const expiresAt = parsed.expiresAt === undefined ? current.expiresAt : parsed.expiresAt;
    assertWindow(startsAt, expiresAt);
    await tx
      .update(announcements)
      .set({
        message: parsed.message,
        level: parsed.level,
        startsAt: parsed.startsAt,
        expiresAt: parsed.expiresAt,
        active: parsed.active,
      })
      .where(eq(announcements.id, id));
    return true;
  });
  return updated ? getAnnouncement(id) : null;
}

/** Activates or deactivates. Returns null when the id does not exist. */
export async function setActive(id: number, active: boolean): Promise<AdminAnnouncement | null> {
  const rows = await getDb()
    .update(announcements)
    .set({ active })
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });
  return rows.length ? getAnnouncement(id) : null;
}

/** Deletes. Returns false when the id does not exist. */
export async function remove(id: number): Promise<boolean> {
  const rows = await getDb()
    .delete(announcements)
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });
  return rows.length > 0;
}
