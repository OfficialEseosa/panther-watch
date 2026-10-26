import "server-only";
import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import type { GoogleUserInfo } from "./google";

export interface UpsertResult {
  user: User;
  /**
   * True only for a brand-new account (the insert won). The OAuth callback sends the welcome
   * email on this; a returning sign-in or linking a legacy row is `false`.
   */
  created: boolean;
}

/**
 * The email belongs to a PantherWatch account that is already bound to a DIFFERENT Google
 * account (`google_sub`). Never re-link: that would hand the account to whoever controls the
 * second Google identity. The callback maps this to `/?auth_error=account_conflict`.
 */
export class AccountConflictError extends Error {
  readonly code = "account_conflict";
  constructor() {
    super("A different Google account already uses this email address");
    this.name = "AccountConflictError";
  }
}

/**
 * Google did not mark the email verified. Such an identity may neither create an account nor
 * link to an existing one. The callback maps this to `/?auth_error=unverified_email`.
 */
export class UnverifiedEmailError extends Error {
  readonly code = "unverified_email";
  constructor() {
    super("Google has not verified this email address");
    this.name = "UnverifiedEmailError";
  }
}

/**
 * Finds or creates the PantherWatch user for a Google sign-in, keeping existing `users.id`
 * UUIDs so watched sections and schedules stay attached.
 *
 * 1. `google_sub` matches: sign in, refreshing name, picture and (if verified and free) email.
 * 2. Otherwise a row with the same email (case-insensitive):
 *    - its `google_sub` is null (legacy Supabase-era row): link it, only if Google verified
 *      the email (else UnverifiedEmailError);
 *    - its `google_sub` is a different sub: AccountConflictError.
 * 3. Otherwise create a row, only if the email is verified (else UnverifiedEmailError).
 */
export async function upsertGoogleUser(info: GoogleUserInfo): Promise<UpsertResult> {
  const existing = await findBySub(info.sub);
  if (existing) return { user: await refresh(existing, info), created: false };

  const byEmail = await findByEmail(info.email);
  if (byEmail) return { user: await link(byEmail, info), created: false };

  assertVerified(info);
  // `id`, `created_at` and `updated_at` default in the database. DO NOTHING covers a
  // concurrent first sign-in (unique google_sub / lower(email)); we then resolve the winner.
  const [created] = await getDb()
    .insert(users)
    .values({
      email: info.email,
      name: info.name,
      pictureUrl: info.picture,
      googleSub: info.sub,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { user: created, created: true };

  const raced = (await findBySub(info.sub)) ?? (await findByEmail(info.email));
  if (!raced) throw new Error("User insert conflicted but no conflicting row was found");
  return {
    user: raced.googleSub === info.sub ? await refresh(raced, info) : await link(raced, info),
    created: false,
  };
}

function assertVerified(info: GoogleUserInfo): void {
  if (info.email_verified !== true) throw new UnverifiedEmailError();
}

/** Binds a legacy row (null `google_sub`) to this Google identity, then refreshes it. */
async function link(existing: User, info: GoogleUserInfo): Promise<User> {
  if (existing.googleSub !== null && existing.googleSub !== info.sub) {
    throw new AccountConflictError();
  }
  assertVerified(info);
  if (existing.googleSub === info.sub) return refresh(existing, info);

  // Conditional on google_sub still being null, so two concurrent sign-ins cannot both link.
  const [linked] = await getDb()
    .update(users)
    .set({ googleSub: info.sub, updatedAt: new Date() })
    .where(and(eq(users.id, existing.id), isNull(users.googleSub)))
    .returning();
  if (linked) return refresh(linked, info);

  const current = await findOne(eq(users.id, existing.id));
  if (current?.googleSub === info.sub) return refresh(current, info);
  throw new AccountConflictError();
}

/**
 * Refreshes the profile from Google on every sign-in. The email is updated only when Google
 * verified it and no other row already uses it (unique `lower(email)`); otherwise the stored
 * email is kept.
 */
async function refresh(existing: User, info: GoogleUserInfo): Promise<User> {
  const profile = {
    name: info.name ?? existing.name,
    pictureUrl: info.picture,
    updatedAt: new Date(),
  };

  if (info.email_verified === true && info.email !== existing.email) {
    const taken = await findOne(
      and(sql`lower(${users.email}) = lower(${info.email})`, ne(users.id, existing.id)) as SQL,
    );
    if (!taken) {
      try {
        return await update(existing.id, { ...profile, email: info.email });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Lost a race for the email; keep the old one.
      }
    }
  }
  return update(existing.id, profile);
}

async function update(id: string, values: Partial<typeof users.$inferInsert>): Promise<User> {
  const [user] = await getDb().update(users).set(values).where(eq(users.id, id)).returning();
  if (!user) throw new Error("User row disappeared during sign-in");
  return user;
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

function findBySub(sub: string): Promise<User | undefined> {
  return findOne(eq(users.googleSub, sub));
}

function findByEmail(email: string): Promise<User | undefined> {
  return findOne(sql`lower(${users.email}) = lower(${email})`);
}

async function findOne(where: SQL): Promise<User | undefined> {
  const [user] = await getDb().select().from(users).where(where).limit(1);
  return user;
}
