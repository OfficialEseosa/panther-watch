import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { rmpCache } from "@/db/schema/course-meta";
import { resolveDb, type DbOptions } from "./db";
import { CHROME_USER_AGENT, defaultFetch, type FetchLike } from "./http";
import { foldLastName, foldNamePart, parseName, type ParsedName } from "./names";

/**
 * RateMyProfessors' unofficial GraphQL API. It is a public Relay endpoint guarded only by
 * the hard-coded Basic auth header RMP ships in its own web bundle ("test:test"). Lookups
 * are scoped to GSU (School-360, relay id "U2Nob29sLTM2MA=="). One search query returns
 * everything displayed, so there is no second round trip.
 */

export const RMP_ENDPOINT = "https://www.ratemyprofessors.com/graphql";
export const RMP_SCHOOL_ID = "U2Nob29sLTM2MA==";
const RMP_AUTH = "Basic dGVzdDp0ZXN0";
const PROFILE_URL = "https://www.ratemyprofessors.com/professor/";
const RMP_TIMEOUT_MS = 15_000;
const MAX_TAGS = 5;

export const RMP_HIT_TTL_MS = 24 * 60 * 60 * 1000;
export const RMP_MISS_TTL_MS = 6 * 60 * 60 * 1000;

export const RMP_SEARCH_QUERY =
  "query Search($query: TeacherSearchQuery!) {" +
  "  newSearch {" +
  "    teachers(query: $query) {" +
  "      edges { node {" +
  "        legacyId firstName lastName department" +
  "        avgRating avgDifficulty numRatings wouldTakeAgainPercent" +
  "        ratingsDistribution { r1 r2 r3 r4 r5 total }" +
  "        teacherRatingTags { tagName tagCount }" +
  "      } }" +
  "    }" +
  "  }" +
  "}";

export interface RmpTag {
  name: string;
  count: number;
}

export interface RmpDistribution {
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
}

export interface RmpTeacher {
  legacyId: number;
  firstName: string;
  lastName: string;
  department: string;
  avgRating: number | null;
  avgDifficulty: number | null;
  numRatings: number | null;
  wouldTakeAgainPercent: number | null;
  distribution: RmpDistribution | null;
  tags: RmpTag[];
}

/** Same fields as the Java `ProfessorRating` DTO. */
export interface ProfessorRating {
  professorQueried: string | null;
  found: boolean;
  matchedName: string | null;
  department: string | null;
  legacyId: number | null;
  profileUrl: string | null;
  /** Overall quality, 0-5. */
  avgRating: number | null;
  /** Average difficulty, 0-5. */
  avgDifficulty: number | null;
  numRatings: number | null;
  /** 0-100; RMP sends -1 when nobody answered. */
  wouldTakeAgainPercent: number | null;
  /** Star buckets, Awful (r1) to Awesome (r5). */
  distribution: RmpDistribution | null;
  /** Most-applied tags, highest count first (at most 5). */
  topTags: RmpTag[];
}

// --------------------------------------------------------------------- response parsing

const num = z.number().nullish().transform((value) => value ?? null);
const int0 = z.number().nullish().transform((value) => value ?? 0);
const str = z.string().nullish().transform((value) => value ?? "");

const teacherNode = z.object({
  legacyId: z.number(),
  firstName: str,
  lastName: str,
  department: str,
  avgRating: num,
  avgDifficulty: num,
  numRatings: num,
  wouldTakeAgainPercent: num,
  ratingsDistribution: z
    .object({ r1: int0, r2: int0, r3: int0, r4: int0, r5: int0 })
    .nullish()
    .transform((value) => value ?? null),
  teacherRatingTags: z
    .array(z.object({ tagName: str, tagCount: int0 }))
    .nullish()
    .transform((value) => value ?? []),
});

const searchResponse = z.object({
  data: z
    .object({
      newSearch: z
        .object({
          teachers: z
            .object({ edges: z.array(z.object({ node: teacherNode })).nullish() })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

/** Teachers from an RMP search response body. Throws when the body is not the expected shape. */
export function parseTeacherSearch(body: unknown): RmpTeacher[] {
  const edges = searchResponse.parse(body).data?.newSearch?.teachers?.edges ?? [];
  return edges.map(({ node }) => ({
    legacyId: node.legacyId,
    firstName: node.firstName,
    lastName: node.lastName,
    department: node.department,
    avgRating: node.avgRating,
    avgDifficulty: node.avgDifficulty,
    numRatings: node.numRatings,
    wouldTakeAgainPercent: node.wouldTakeAgainPercent,
    distribution: node.ratingsDistribution,
    tags: node.teacherRatingTags.map((tag) => ({ name: tag.tagName, count: tag.tagCount })),
  }));
}

export interface RmpOptions {
  fetchImpl?: FetchLike;
  endpoint?: string;
  schoolId?: string;
  timeoutMs?: number;
}

/** Searches GSU teachers by free text. Returns null when the request fails (never cached). */
export async function searchTeachers(text: string, options: RmpOptions = {}): Promise<RmpTeacher[] | null> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  try {
    const response = await fetchImpl(options.endpoint ?? RMP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: RMP_AUTH,
        "User-Agent": CHROME_USER_AGENT,
      },
      body: JSON.stringify({
        query: RMP_SEARCH_QUERY,
        variables: { query: { text, schoolID: options.schoolId ?? RMP_SCHOOL_ID } },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? RMP_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.text().catch(() => "");
      console.warn(`RMP search "${text}" responded ${response.status}`);
      return null;
    }
    return parseTeacherSearch(await response.json());
  } catch (error) {
    console.warn(`RMP search "${text}" failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// ------------------------------------------------------------------------- matching

function firstNameMatches(rmpFirst: string, queryFirst: string | undefined): boolean {
  if (!queryFirst) return false;
  const a = foldNamePart(rmpFirst).replace(/\s+/g, "");
  const b = foldNamePart(queryFirst).replace(/\s+/g, "");
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * Picks the hit whose last name matches and whose first name matches or is a prefix either
 * way ("Alina" vs "Alina Marie"), or matches the preferred name. Ties go to the most-rated
 * profile. Falls back to a last-name-only match when no first name matches.
 */
export function bestMatch(hits: readonly RmpTeacher[], name: ParsedName): RmpTeacher | null {
  const wantedLast = foldLastName(name.last);
  const sameLast = hits.filter((teacher) => foldLastName(teacher.lastName) === wantedLast);
  const mostRated = (candidates: RmpTeacher[]) =>
    candidates.reduce<RmpTeacher | null>(
      (best, teacher) => (!best || (teacher.numRatings ?? 0) > (best.numRatings ?? 0) ? teacher : best),
      null,
    );
  const exact = sameLast.filter(
    (teacher) => firstNameMatches(teacher.firstName, name.first) || firstNameMatches(teacher.firstName, name.preferred),
  );
  return mostRated(exact) ?? mostRated(sameLast);
}

function notFound(professorQueried: string | null): ProfessorRating {
  return {
    professorQueried,
    found: false,
    matchedName: null,
    department: null,
    legacyId: null,
    profileUrl: null,
    avgRating: null,
    avgDifficulty: null,
    numRatings: null,
    wouldTakeAgainPercent: null,
    distribution: null,
    topTags: [],
  };
}

export function toProfessorRating(teacher: RmpTeacher, professorQueried: string | null): ProfessorRating {
  return {
    professorQueried,
    found: true,
    matchedName: `${teacher.firstName} ${teacher.lastName}`.trim(),
    department: teacher.department,
    legacyId: teacher.legacyId,
    profileUrl: `${PROFILE_URL}${teacher.legacyId}`,
    avgRating: teacher.avgRating,
    avgDifficulty: teacher.avgDifficulty,
    numRatings: teacher.numRatings,
    wouldTakeAgainPercent: teacher.wouldTakeAgainPercent,
    distribution: teacher.distribution,
    topTags: [...teacher.tags].sort((a, b) => b.count - a.count).slice(0, MAX_TAGS),
  };
}

// --------------------------------------------------------------------------- caching

const cachedRating = z.object({
  found: z.literal(true),
  matchedName: z.string().nullable(),
  department: z.string().nullable(),
  legacyId: z.number().nullable(),
  profileUrl: z.string().nullable(),
  avgRating: z.number().nullable(),
  avgDifficulty: z.number().nullable(),
  numRatings: z.number().nullable(),
  wouldTakeAgainPercent: z.number().nullable(),
  distribution: z.object({ r1: z.number(), r2: z.number(), r3: z.number(), r4: z.number(), r5: z.number() }).nullable(),
  topTags: z.array(z.object({ name: z.string(), count: z.number() })),
});

export const rmpCacheKey = (name: ParsedName) => `rmp:${name.key}`;

export interface RatingOptions extends RmpOptions, DbOptions {
  now?: Date;
  /** Set false to bypass the rmp_cache table entirely. */
  cache?: boolean;
}

type CacheLookup = { hit: true; rating: ProfessorRating } | { hit: false };

async function readCache(key: string, raw: string, options: RatingOptions, now: Date): Promise<CacheLookup> {
  const db = await resolveDb(options.db);
  const [row] = await db
    .select({ payload: rmpCache.payload, fetchedAt: rmpCache.fetchedAt })
    .from(rmpCache)
    .where(eq(rmpCache.queryKey, key))
    .limit(1);
  if (!row) return { hit: false };
  const ttl = row.payload === null ? RMP_MISS_TTL_MS : RMP_HIT_TTL_MS;
  if (now.getTime() - row.fetchedAt.getTime() >= ttl) return { hit: false };
  if (row.payload === null) return { hit: true, rating: notFound(raw) };
  const parsed = cachedRating.safeParse(row.payload);
  return parsed.success ? { hit: true, rating: { professorQueried: raw, ...parsed.data } } : { hit: false };
}

async function writeCache(key: string, rating: ProfessorRating | null, options: RatingOptions, now: Date) {
  const db = await resolveDb(options.db);
  // professorQueried is per request; undefined keys are dropped by JSON serialization.
  const payload = rating ? { ...rating, professorQueried: undefined } : null;
  await db
    .insert(rmpCache)
    .values({ queryKey: key, payload, fetchedAt: now })
    .onConflictDoUpdate({ target: rmpCache.queryKey, set: { payload: sql`excluded.payload`, fetchedAt: now } });
}

/**
 * RMP summary for a GoSolar/APEX/free-text professor name. Cached in `rmp_cache` per
 * professor key: hits for 24 h, misses (RMP answered, nobody matched) for 6 h. Failed RMP
 * requests are not cached. Cache errors are logged and never fail the lookup.
 */
export async function getProfessorRating(
  raw: string | null | undefined,
  options: RatingOptions = {},
): Promise<ProfessorRating> {
  const queried = raw ?? null;
  const name = parseName(raw);
  if (!name || !name.first || !name.last) return notFound(queried);

  const useCache = options.cache !== false;
  const now = options.now ?? new Date();
  const key = rmpCacheKey(name);

  if (useCache) {
    try {
      const cached = await readCache(key, queried ?? "", options, now);
      if (cached.hit) return { ...cached.rating, professorQueried: queried };
    } catch (error) {
      console.warn("rmp_cache read failed:", error instanceof Error ? error.message : error);
    }
  }

  const hits = await searchTeachers(`${name.first} ${name.last}`, options);
  if (hits === null) return notFound(queried);

  const match = bestMatch(hits, name);
  const rating = match ? toProfessorRating(match, queried) : null;
  if (useCache) {
    try {
      await writeCache(key, rating, options, now);
    } catch (error) {
      console.warn("rmp_cache write failed:", error instanceof Error ? error.message : error);
    }
  }
  return rating ?? notFound(queried);
}
