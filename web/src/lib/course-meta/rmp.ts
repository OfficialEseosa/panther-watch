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
  /**
   * How the name matched (null when not found): "exact", "initial" (GoSolar only gave an initial)
   * or "fuzzy" (full first name, last name misspelled by one or two letters on RMP).
   */
  matchQuality: RmpMatchQuality | null;
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

/**
 * How a hit matched: "exact" (last name equal, first name in full or by prefix), "initial"
 * (last name equal, GoSolar only gave an initial) or "fuzzy" (first name in full, last name a
 * typo or two off, e.g. RMP's "Ortegies-Young" for "Ortgies-Young").
 */
export type RmpMatchQuality = "exact" | "initial" | "fuzzy";

const foldFirst = (value: string) => foldNamePart(value).replace(/[\s-]+/g, "");

/** Equal, or a prefix either way ("Alina" vs "Alina Marie", "Chris" vs "Christopher"). Both sides need 2+ letters. */
function fullNameMatches(rmpFirst: string, queryFirst: string): boolean {
  if (rmpFirst.length < 2 || queryFirst.length < 2) return false;
  return rmpFirst === queryFirst || rmpFirst.startsWith(queryFirst) || queryFirst.startsWith(rmpFirst);
}

/**
 * How the query's given name matches an RMP first name, or null. Full names (the first given
 * name, every given name together, the preferred name) must match in full or by prefix. A bare
 * initial only counts when GoSolar gave nothing but initials ("Smith, J."): a full first name
 * never matches an initial-only RMP profile, and an initial never matches a different name.
 */
function firstNameMatch(rmpFirstRaw: string, name: ParsedName): RmpMatchQuality | null {
  const rmpFirst = foldFirst(rmpFirstRaw);
  if (!rmpFirst) return null;
  const full = [name.first, name.given, name.preferred].map((part) => foldFirst(part ?? "")).filter((part) => part.length > 1);
  if (full.some((part) => fullNameMatches(rmpFirst, part))) return "exact";
  const givenTokens = foldNamePart(name.given ?? name.first).split(/[\s-]+/).filter(Boolean);
  const initialsOnly = givenTokens.length > 0 && givenTokens.every((token) => token.length === 1);
  if (initialsOnly && !name.preferred && rmpFirst.startsWith(givenTokens[0])) return "initial";
  return null;
}

export interface RmpMatch {
  teacher: RmpTeacher;
  quality: RmpMatchQuality;
}

/**
 * The RMP profile for a professor, or null. A hit counts only when the last name matches (folded:
 * case, diacritics, suffixes) AND the first name matches (see `firstNameMatch`); there is no
 * last-name-only fallback, because a namesake's rating is worse than none. Full-name matches beat
 * initial matches. Ties go to the most-rated profile (RMP often has duplicate profiles for one
 * person), except that an initial matching several different first names ("J." vs John and
 * James) is ambiguous and returns null. A query without a first name never matches.
 *
 * Only when nothing passes that strict test, a hit whose first name is a full ("exact") match and
 * whose last name is within `lastNameTolerance` typos counts as "fuzzy" (closest last name first,
 * then most-rated). Initial-only first names never fuzzy-match.
 */
export function findMatch(hits: readonly RmpTeacher[], name: ParsedName): RmpMatch | null {
  if (!foldFirst(name.first)) return null;
  const wantedLast = foldLastName(name.last);
  const matched = hits
    .filter((teacher) => foldLastName(teacher.lastName) === wantedLast)
    .map((teacher) => ({ teacher, quality: firstNameMatch(teacher.firstName, name) }))
    .filter((m): m is RmpMatch => m.quality !== null);
  const exact = matched.filter((m) => m.quality === "exact");
  const pool = exact.length > 0 ? exact : matched;
  if (pool.length > 0) {
    if (pool[0].quality === "initial" && new Set(pool.map((m) => foldFirst(m.teacher.firstName))).size > 1) return null;
    return mostRated(pool);
  }

  const wantedLetters = lettersOf(wantedLast);
  const fuzzy = hits
    .filter((teacher) => firstNameMatch(teacher.firstName, name) === "exact")
    .map((teacher) => {
      const letters = lettersOf(foldLastName(teacher.lastName));
      return { teacher, distance: editDistance(letters, wantedLetters), tolerance: lastNameTolerance(letters, wantedLetters) };
    })
    .filter((candidate) => candidate.distance <= candidate.tolerance);
  if (fuzzy.length === 0) return null;
  const closest = Math.min(...fuzzy.map((candidate) => candidate.distance));
  return mostRated(
    fuzzy.filter((candidate) => candidate.distance === closest).map(({ teacher }) => ({ teacher, quality: "fuzzy" as const })),
  );
}

function mostRated(candidates: readonly RmpMatch[]): RmpMatch {
  return candidates.reduce((best, m) => ((m.teacher.numRatings ?? 0) > (best.teacher.numRatings ?? 0) ? m : best));
}

/** Letters only, for typo tolerance ("ortgies-young" -> "ortgiesyoung"). */
const lettersOf = (foldedLast: string) => foldedLast.replace(/[\s-]+/g, "");

/**
 * Typos tolerated between two last names (letters only): none under 6 letters, so Smith/Smyth
 * stay different people; 1 from 6 letters; 2 when both are 8+ letters.
 */
function lastNameTolerance(a: string, b: string): number {
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 8) return 2;
  if (shorter >= 7) return 1;
  return 0;
}

/** Optimal-string-alignment (restricted Damerau-Levenshtein) distance: edits plus adjacent swaps. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** `findMatch(hits, name)?.teacher ?? null`. */
export function bestMatch(hits: readonly RmpTeacher[], name: ParsedName): RmpTeacher | null {
  return findMatch(hits, name)?.teacher ?? null;
}

function notFound(professorQueried: string | null): ProfessorRating {
  return {
    professorQueried,
    found: false,
    matchedName: null,
    matchQuality: null,
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

export function toProfessorRating(
  teacher: RmpTeacher,
  professorQueried: string | null,
  matchQuality: RmpMatchQuality = "exact",
): ProfessorRating {
  return {
    professorQueried,
    found: true,
    matchedName: `${teacher.firstName} ${teacher.lastName}`.trim(),
    matchQuality,
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
  matchQuality: z.enum(["exact", "initial", "fuzzy"]),
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

/**
 * Versioned so a matching-rule change orphans old rows instead of serving them: v1 rows (`rmp:last|first`)
 * were written by the last-name-only fallback and may hold a namesake's rating. Orphaned rows are
 * just never read again.
 */
export const RMP_CACHE_VERSION = "v2";
export const rmpCacheKey = (name: ParsedName) => `rmp:${RMP_CACHE_VERSION}:${name.key}`;

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

  const match = findMatch(hits, name);
  const rating = match ? toProfessorRating(match.teacher, queried, match.quality) : null;
  if (useCache) {
    try {
      await writeCache(key, rating, options, now);
    } catch (error) {
      console.warn("rmp_cache write failed:", error instanceof Error ? error.message : error);
    }
  }
  return rating ?? notFound(queried);
}
