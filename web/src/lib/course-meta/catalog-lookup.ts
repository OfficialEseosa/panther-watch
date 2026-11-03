import { catalogCourses } from "@/db/schema/course-meta";
import type { CatalogLevel } from "./catalog";
import { resolveDb, type DbOptions } from "./db";

/**
 * Course name -> code, deterministically: `findCourses("calculus 2")` ranks `catalog_courses`
 * rows (MATH 2212 Calculus of One Variable II first) so the assistant never maps a name from
 * its own memory. In-process over an in-memory copy of the table (about 10k rows), loaded on
 * first use per instance and reloaded hourly (stale copy served while reloading).
 *
 * Scoring (0..1):
 * - a course code in the query ("csc 1301", "CSC1301", "math-2212"): 1.0, and every other
 *   candidate is capped at CAPPED (0.7);
 * - a nickname from SYNONYMS ("calc 2", "intro to programming", "stats") that covers every
 *   meaningful word of the query: 1.0 for its target(s); with ONE target the others are capped
 *   at CAPPED, with several (physics 1 = PHYS 2211 or PHYS 1111) they tie, so it is ambiguous;
 * - title words, each matched exactly (1), by prefix (0.9: "calc" -> calculus, "intro" ->
 *   introduction), by word family (0.85: "ethics" -> ethical, "computing" -> computer) or with
 *   one edit for words of 5+ letters (0.8: "structres"), the average being the match quality:
 *   - the whole title, no more and no less ("software engineering" = "Software Engineering -
 *     CTW"; "CTW", "of", "and" don't count): EXACT_TITLE (0.97) x quality;
 *   - every query word in a longer title: (0.45 + 0.3 x the share of the title matched) x
 *     quality, so at most ~0.75: a longer title alone ("Secure Software Engineering") is never
 *     high, and an exact title beats it by more than the margin;
 *   - some query words missing: below 0.45;
 * - description words: up to 0.05 on top of a title score, or 0.3 alone.
 * "Meaningful" = not a stop word ("the", "of", "can", "you", "professors", "sections"...) and
 * found in some catalog title, so chat words around a course name ("Can you compare the
 * professors for calculus 2?") don't count against it. Roman numerals count as numbers
 * ("Calculus II" = "calculus 2"); a lone "I" only after a word ("calc i", not "can I").
 *
 * Confidence: "high" when the top score is >= 0.8 and >= 0.25 above the best candidate of a
 * DIFFERENT course (CHEM 1211 and its combined lecture/lab CHEM 1211K are one course here),
 * "ambiguous" otherwise, "none" without candidates.
 *
 * Levels (`catalog_courses.level` is derived, see the table): US matches US and UA courses
 * (undergraduate), UA matches UA courses and US courses below 3000 (what Perimeter College
 * teaches), GS and LW match only themselves. A course code in the query ignores the level.
 */

export interface CatalogEntry {
  subject: string;
  courseNumber: string;
  title: string;
  description: string | null;
  credits: string | null;
  level: CatalogLevel | null;
}

export interface CatalogCandidate extends CatalogEntry {
  /** 0..1, rounded to 2 decimals. */
  score: number;
}

export type CatalogConfidence = "high" | "ambiguous" | "none";
export type CatalogMatchKind = "code" | "nickname" | "title" | "description";

export interface FindCoursesResult {
  candidates: CatalogCandidate[];
  confidence: CatalogConfidence;
  /** How the top candidate matched. */
  matchedBy: CatalogMatchKind | null;
  /** The query words that matched, normalized ("calculus 2", "data structures"); "" when none. */
  matched: string;
}

export interface FindCoursesOptions {
  level?: CatalogLevel;
  /** Candidates to return (default 5, at most 20). */
  limit?: number;
}

export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 20;
const HIGH_SCORE = 0.8;
const HIGH_MARGIN = 0.25;
const CAPPED = 0.7;
/** A query that is exactly a course's title (below the 1.0 of a code or nickname). */
const EXACT_TITLE = 0.97;

// ------------------------------------------------------------------------------- tokens

/** Words that never carry a course name (titles and queries). */
const TITLE_STOP = new Set("a an and the of to in for on with at by from or ctw".split(" "));

/** Chat words around a course name (queries only). Kept off course-name words like "information". */
const QUERY_STOP = new Set(
  (
    "i im ive id me my mine we us our you your u he she they them it its is are was were be been being am " +
    "do does did doing done have has had can could would should will shall may might must " +
    "what which who whom whose when where why how there here this that these those any some all " +
    "please pls thanks thank hi hello hey ok okay yes no not just also really very much many more most " +
    "want wanna need needs looking look find show tell give get got let lets know think help " +
    "take taking took register registering enroll enrolling sign up about like into than then so if " +
    "compare comparing comparison vs versus between best good better great easy easier easiest hard harder hardest " +
    "professor professors prof profs instructor instructors teacher teachers teaches taught " +
    "section sections class classes course courses open opened seat seats available availability full " +
    "waitlist waitlisted offered offering offer offers recommend recommendation " +
    "next semester semesters term terms spring summer fall autumn year " +
    "time times schedule syllabus syllabi grade grades gpa rating ratings rmp crn crns code number " +
    "gsu georgia state university"
  ).split(" "),
);

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
const NUMERALS = new Set(["1", "2", "3", "4", "5", "6"]);
const isStop = (token: string, query: boolean) => TITLE_STOP.has(token) || (query && QUERY_STOP.has(token));

/**
 * Lower-case words: "&" is "and", apostrophes vanish ("master's" -> masters), "calc2" / "cs1"
 * split ("calc 2"), roman numerals become digits. In a query, a lone "i" is a numeral only right
 * after a meaningful word ("calc i", not "can i").
 */
export function tokenize(text: string, { query = false } = {}): string[] {
  const words = text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/([a-z])([1-6])(?![0-9])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const word of words) {
    const roman = ROMAN[word];
    if (roman && (word !== "i" || !query || (out.length > 0 && /[a-z]/.test(out.at(-1)!) && !isStop(out.at(-1)!, true)))) {
      out.push(roman);
    } else {
      out.push(word);
    }
  }
  return out;
}

/** Content words: stop words dropped, and 3+ digit numbers (years, CRNs) in a query. */
function contentTokens(tokens: string[], query: boolean): string[] {
  return tokens.filter((t) => !isStop(t, query) && !(query && /^\d{3,}$/.test(t)));
}

// ------------------------------------------------------------------------------- synonyms

/**
 * Common nicknames -> course codes, checked against GoSolar's catalog on 2026-11-02 (Spring 2027).
 * Targets missing from the loaded catalog are ignored, so an outdated entry can never produce a
 * code that doesn't exist. Not here on purpose: anything the title alone already finds clearly.
 */
const SYNONYMS: ReadonlyArray<{ phrases: string[]; targets: string[] }> = [
  { phrases: ["calc 1", "calculus 1", "calc one", "calculus one"], targets: ["MATH 2211"] },
  { phrases: ["calc 2", "calculus 2", "calc two", "calculus two"], targets: ["MATH 2212"] },
  { phrases: ["calc 3", "calculus 3", "calc three", "calculus three", "multivariable calculus", "multivariable calc", "multivariate calc"], targets: ["MATH 2215"] },
  {
    phrases: ["intro to programming", "intro programming", "introduction to programming", "cs 1", "intro to cs", "intro to computer science", "programming 1"],
    targets: ["CSC 1301"],
  },
  { phrases: ["cs 2", "programming 2"], targets: ["CSC 1302"] },
  { phrases: ["data structures", "data structure"], targets: ["CSC 2720"] },
  { phrases: ["discrete", "discrete math", "discrete maths"], targets: ["MATH 2420"] },
  { phrases: ["linear algebra", "lin alg", "linear alg"], targets: ["MATH 2641"] },
  { phrases: ["stats", "stat", "statistics", "intro stats", "intro to stats", "intro to statistics", "elementary stats"], targets: ["MATH 1401"] },
  { phrases: ["physics 1", "phys 1"], targets: ["PHYS 2211", "PHYS 1111"] },
  { phrases: ["physics 2", "phys 2"], targets: ["PHYS 2212", "PHYS 1112"] },
  { phrases: ["chem 1", "chemistry 1", "gen chem 1", "general chemistry 1"], targets: ["CHEM 1211"] },
  { phrases: ["chem 2", "chemistry 2", "gen chem 2", "general chemistry 2"], targets: ["CHEM 1212"] },
  { phrases: ["bio 1", "biology 1"], targets: ["BIOL 2107", "BIOL 1103"] },
  { phrases: ["bio 2", "biology 2"], targets: ["BIOL 2108", "BIOL 1104"] },
  {
    phrases: ["english comp 1", "english composition 1", "eng comp 1", "engl comp 1", "english 1", "comp 1", "composition 1"],
    targets: ["ENGL 1101"],
  },
  {
    phrases: ["english comp 2", "english composition 2", "eng comp 2", "engl comp 2", "english 2", "comp 2", "composition 2"],
    targets: ["ENGL 1102"],
  },
  { phrases: ["precalc", "pre calc", "precalculus", "pre calculus"], targets: ["MATH 1113"] },
  { phrases: ["college algebra"], targets: ["MATH 1111"] },
];

const SYNONYM_PHRASES = SYNONYMS.flatMap(({ phrases, targets }) => phrases.map((phrase) => ({ tokens: tokenize(phrase), targets })))
  // Longest first, so "english comp 1" wins over "comp 1".
  .sort((a, b) => b.tokens.length - a.tokens.length);

/** Exported for the synonym check in tests: every nickname target. */
export const SYNONYM_TARGETS: readonly string[] = [...new Set(SYNONYMS.flatMap((s) => s.targets))];

// ------------------------------------------------------------------------------- the index

interface IndexedEntry extends CatalogEntry {
  /** "CSC 1301", "CSC 1301K". */
  code: string;
  /** Subject and the 4 digits: "CSC 1301" for CSC 1301L too (one course for the confidence margin). */
  base: string;
  number: number;
  titleTokens: string[];
  descTokens: Set<string>;
}

export interface CatalogIndex {
  entries: IndexedEntry[];
  byCode: Map<string, IndexedEntry>;
  /** Title word -> entries. */
  titleWords: Map<string, IndexedEntry[]>;
  /** Description word -> entries. */
  descWords: Map<string, IndexedEntry[]>;
}

/** Description words indexed per course: enough for the gist, bounded for memory. */
const DESCRIPTION_CHARS = 600;

export function buildCatalogIndex(rows: readonly CatalogEntry[]): CatalogIndex {
  const entries: IndexedEntry[] = [];
  const byCode = new Map<string, IndexedEntry>();
  const titleWords = new Map<string, IndexedEntry[]>();
  const descWords = new Map<string, IndexedEntry[]>();
  const add = (map: Map<string, IndexedEntry[]>, word: string, entry: IndexedEntry) => {
    const list = map.get(word);
    if (list) list.push(entry);
    else map.set(word, [entry]);
  };
  for (const row of rows) {
    const code = `${row.subject} ${row.courseNumber}`;
    const digits = /^\d{4}/.exec(row.courseNumber)?.[0] ?? row.courseNumber;
    const entry: IndexedEntry = {
      ...row,
      code,
      base: `${row.subject} ${digits}`,
      number: Number(digits) || 0,
      titleTokens: [...new Set(contentTokens(tokenize(row.title), false))],
      descTokens: new Set(contentTokens(tokenize((row.description ?? "").slice(0, DESCRIPTION_CHARS)), false).filter((t) => t.length >= 3)),
    };
    entries.push(entry);
    byCode.set(code, entry);
    for (const word of entry.titleTokens) add(titleWords, word, entry);
    for (const word of entry.descTokens) add(descWords, word, entry);
  }
  return { entries, byCode, titleWords, descWords };
}

// ------------------------------------------------------------------------------- matching

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const SUFFIXES = ["ations", "ation", "ically", "ical", "ings", "ing", "ies", "ics", "ers", "er", "al", "es", "ic", "s"];

/** A light stem for word families: ethics/ethical -> ethic, computing/computer/computation -> comput. */
export function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Vocabulary words `token` stands for, with the match quality. */
function wordMatches(token: string, vocabulary: Map<string, IndexedEntry[]>): Map<string, number> {
  const found = new Map<string, number>();
  if (vocabulary.has(token)) found.set(token, 1);
  if (NUMERALS.has(token) || /^\d+$/.test(token)) return found; // numbers match exactly
  const root = token.length >= 5 ? stem(token) : null;
  const better = (word: string, weight: number) => found.set(word, Math.max(found.get(word) ?? 0, weight));
  for (const word of vocabulary.keys()) {
    if (word === token) continue;
    if (token.length >= 3 && word.startsWith(token)) better(word, 0.9);
    else if (root && word.length >= 5 && stem(word) === root) better(word, 0.85);
    else if (token.length >= 5 && word.length >= 5 && editDistanceAtMostOne(token, word)) better(word, 0.8);
  }
  return found;
}

function levelMatches(entry: IndexedEntry, level: CatalogLevel | undefined): boolean {
  if (!level) return true;
  if (level === "US") return entry.level === "US" || entry.level === "UA";
  if (level === "UA") return entry.level === "UA" || (entry.level === "US" && entry.number < 3000);
  return entry.level === level;
}

const CODE_IN_QUERY = /(?<![A-Za-z0-9])([A-Za-z]{2,5})[ \t-]?(\d{4}[A-Za-z]?)(?![A-Za-z0-9])/g;

/** Is `needle` a contiguous run inside `haystack`? */
function containsRun(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

interface Scored {
  entry: IndexedEntry;
  score: number;
  kind: CatalogMatchKind;
}

/** The ranking itself, over a built index (pure; `findCourses` loads the index). */
export function searchCatalog(index: CatalogIndex, query: string, { level, limit = DEFAULT_LIMIT }: FindCoursesOptions = {}): FindCoursesResult {
  const max = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  const scores = new Map<IndexedEntry, Scored>();
  const raise = (entry: IndexedEntry, score: number, kind: CatalogMatchKind) => {
    const current = scores.get(entry);
    if (!current || score > current.score) scores.set(entry, { entry, score, kind });
  };
  let cap: IndexedEntry[] | null = null;
  let matched = "";

  // 1. Course codes, whatever the level.
  const codes: IndexedEntry[] = [];
  for (const match of query.matchAll(CODE_IN_QUERY)) {
    const entry = index.byCode.get(`${match[1].toUpperCase()} ${match[2].toUpperCase()}`);
    if (entry && !codes.includes(entry)) codes.push(entry);
  }
  for (const entry of codes) raise(entry, 1, "code");
  if (codes.length) {
    cap = codes;
    matched = codes.map((e) => e.code).join(", ");
  }

  // 2. Title and description words.
  const tokens = tokenize(query.replace(CODE_IN_QUERY, " "), { query: true });
  const content = contentTokens(tokens, true);
  const titleMatches = new Map<string, Map<string, number>>();
  for (const token of new Set(content)) {
    const found = wordMatches(token, index.titleWords);
    if (found.size) titleMatches.set(token, found);
  }
  // Meaningful = in some title; the rest is chat around the course name. A number alone ("chem 1"
  // without any chemistry title) means nothing.
  const meaningful = content.filter((t) => titleMatches.has(t));
  const unique = meaningful.some((t) => !NUMERALS.has(t)) ? [...new Set(meaningful)] : [];

  if (unique.length) {
    const candidates = new Set<IndexedEntry>();
    for (const token of unique) for (const word of titleMatches.get(token)!.keys()) for (const entry of index.titleWords.get(word) ?? []) candidates.add(entry);
    for (const entry of candidates) {
      if (!levelMatches(entry, level)) continue;
      const titleSet = entry.titleTokens;
      const covered = new Set<string>();
      let quality = 0;
      let hits = 0;
      for (const token of unique) {
        const words = titleMatches.get(token)!;
        let best = 0;
        let bestWord = "";
        for (const word of titleSet) {
          const weight = words.get(word) ?? 0;
          if (weight > best) {
            best = weight;
            bestWord = word;
          }
        }
        if (best > 0) {
          hits++;
          quality += best;
          covered.add(bestWord);
        }
      }
      if (hits === 0) continue;
      const titleShare = covered.size / Math.max(1, titleSet.length);
      const descHits = unique.filter((t) => entry.descTokens.has(t)).length / unique.length;
      let score: number;
      if (hits === unique.length && covered.size === titleSet.length) score = EXACT_TITLE * (quality / hits);
      else if (hits === unique.length) score = (0.45 + 0.3 * titleShare) * (quality / hits) + 0.05 * descHits;
      else score = 0.45 * (quality / unique.length) * (0.5 + 0.5 * titleShare);
      raise(entry, Math.min(score, EXACT_TITLE), "title");
    }
    matched ||= unique.join(" ");
  }

  // Description-only matches (every content word of the query in the description).
  const descQuery = [...new Set(content.filter((t) => t.length >= 3))];
  if (descQuery.length && !codes.length) {
    const lists = descQuery.map((t) => index.descWords.get(t) ?? []);
    if (lists.every((list) => list.length > 0)) {
      const smallest = lists.reduce((a, b) => (a.length <= b.length ? a : b));
      for (const entry of smallest) {
        if (!levelMatches(entry, level) || !descQuery.every((t) => entry.descTokens.has(t))) continue;
        raise(entry, 0.3, "description");
      }
      matched ||= descQuery.join(" ");
    }
  }

  // 3. Nicknames: only when the phrase covers every meaningful word of the query.
  if (!codes.length) {
    for (const { tokens: phrase, targets } of SYNONYM_PHRASES) {
      if (!containsRun(tokens, phrase)) continue;
      const phraseWords = new Set(contentTokens(phrase, true));
      if (unique.some((t) => !phraseWords.has(t))) continue;
      const found = targets.map((code) => index.byCode.get(code)).filter((e): e is IndexedEntry => e !== undefined && levelMatches(e, level));
      if (!found.length) continue;
      for (const entry of found) raise(entry, 1, "nickname");
      if (found.length === 1) cap = found;
      matched = phrase.join(" ");
      break;
    }
  }

  let ranked = [...scores.values()];
  if (cap) {
    const keep = new Set(cap);
    ranked = ranked.map((s) => (keep.has(s.entry) ? s : { ...s, score: Math.min(s.score, CAPPED) }));
  }
  ranked.sort((a, b) => b.score - a.score || a.entry.number - b.entry.number || a.entry.code.localeCompare(b.entry.code));

  const top = ranked[0];
  let confidence: CatalogConfidence = "none";
  if (top) {
    const rival = ranked.find((s) => s.entry.base !== top.entry.base)?.score ?? 0;
    confidence = top.score >= HIGH_SCORE && top.score - rival >= HIGH_MARGIN ? "high" : "ambiguous";
  }
  return {
    candidates: ranked.slice(0, max).map(({ entry, score }) => ({
      subject: entry.subject,
      courseNumber: entry.courseNumber,
      title: entry.title,
      description: entry.description,
      credits: entry.credits,
      level: entry.level,
      score: Math.round(score * 100) / 100,
    })),
    confidence,
    matchedBy: top?.kind ?? null,
    matched: top ? matched : "",
  };
}

// ------------------------------------------------------------------------------- the cache

/** The in-memory copy is reloaded after this long (the table changes once a night). */
export const CATALOG_CACHE_MS = 60 * 60_000;
/** An empty table (no refresh yet) is looked at again sooner. */
const EMPTY_CACHE_MS = 60_000;

let cache: { index: CatalogIndex; until: number } | undefined;
let loading: Promise<CatalogIndex> | undefined;

async function loadIndex(options: DbOptions): Promise<CatalogIndex> {
  const db = await resolveDb(options.db);
  const rows = await db
    .select({
      subject: catalogCourses.subject,
      courseNumber: catalogCourses.courseNumber,
      title: catalogCourses.title,
      description: catalogCourses.description,
      credits: catalogCourses.credits,
      level: catalogCourses.level,
    })
    .from(catalogCourses);
  const index = buildCatalogIndex(rows.map((row) => ({ ...row, level: row.level as CatalogLevel | null })));
  cache = { index, until: Date.now() + (rows.length ? CATALOG_CACHE_MS : EMPTY_CACHE_MS) };
  return index;
}

/** The catalog index: loaded on first use, then reloaded in the background once stale. */
export async function catalogIndex(options: DbOptions = {}): Promise<CatalogIndex> {
  if (cache && Date.now() < cache.until) return cache.index;
  const reload = (loading ??= loadIndex(options).finally(() => {
    loading = undefined;
  }));
  if (cache) {
    reload.catch((error) => console.warn("catalog: reload failed; keeping the old copy:", error instanceof Error ? error.message : error));
    return cache.index;
  }
  return reload;
}

/** Ranked catalog courses for a course name, nickname or code (see the top of this file). */
export async function findCourses(query: string, options: FindCoursesOptions & DbOptions = {}): Promise<FindCoursesResult> {
  return searchCatalog(await catalogIndex(options), query, options);
}

/** Forgets the in-memory copy (tests that change `catalog_courses`). */
export function resetCatalogCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("resetCatalogCacheForTests() is only allowed when NODE_ENV=test");
  cache = undefined;
  loading = undefined;
}
