import "server-only";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { resultsHref } from "@/components/courses/params";
import { getLevelPreference, setLevelPreference } from "@/lib/account";
import { CAMPUS_OPTIONS, DEFAULT_LEVEL, LEVEL_NAMES, LEVEL_PREFERENCES, type LevelPreference } from "@/lib/account/levels";
import {
  countSections,
  courseNumberSchema,
  crnSchema,
  getSectionMeta,
  getSectionRequirements,
  getTerms,
  gosolarOptions,
  isUpstreamError,
  type TermInfo,
  searchSections,
  searchSubjects,
  subjectSchema,
  termCodeSchema,
} from "@/lib/courses";
import { getSyllabus } from "@/lib/course-meta";
import { hasStoredSummary, summarizeSyllabus } from "@/lib/course-meta/syllabus-summary";
import { env } from "@/lib/env";
import { instructorOf, nyDateParts, termLabel, termName } from "@/lib/format";
import { findSectionsByCrn, type CourseData, type CourseGroup } from "@/lib/gosolar";
import { compactMeta, compactRequirements, compactSection } from "@/lib/mcp/format";
import { toolLimiter } from "@/lib/oauth/rate-limit";
import type { Scope } from "@/lib/oauth/scopes";
import {
  addEntry,
  findConflicts,
  findConflictsWith,
  listSchedule,
  removeEntry,
  ScheduleError,
  type Conflict,
} from "@/lib/schedule";
import { addWatch, listWatches, listWatchesWithDetails, removeWatch, WatchError } from "@/lib/watches";
import { watchAddedBody } from "@/lib/watches/messages";

/**
 * The PantherWatch tools, defined once and served two ways:
 *
 * - over MCP (src/lib/mcp/tools.ts registers each one on the McpServer; auth comes from the
 *   OAuth access token and its scopes), and
 * - in-process by the on-site assistant (src/lib/assistant), as the signed-in user with every
 *   scope (and `site: true`).
 *
 * A tool with `scope: "site"` exists only for the on-site assistant: MCP never registers it and
 * `runAs` refuses it without `site: true`. Used for account settings, which have no OAuth scope.
 *
 * Every call goes through `runAs`: scope check, per-user rate limit (shared by both callers),
 * and error mapping. A missing scope is a tool error that tells the assistant how the user can
 * grant it, not an HTTP 403 step-up challenge, because the consent page lets users deliberately
 * leave write access off.
 */

export interface ToolAuth {
  userId: string;
  scopes: readonly Scope[];
  /** The caller is the on-site assistant (the user's own PantherWatch session), not an OAuth client. */
  site?: boolean;
}

/** An OAuth scope, or "site": only the on-site assistant may call it (never served over MCP). */
export type ToolScope = Scope | "site";

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObjectSchema = z.ZodObject<any>;

export interface ToolDefinition<S extends AnyObjectSchema = AnyObjectSchema> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations: ToolAnnotations;
  /** The scope a call needs; "site" = on-site assistant only. */
  scope: ToolScope;
  /** The tool body. `input` is already validated (defaults applied); `runAs` checked scope and rate limit. */
  handler: (auth: ToolAuth, input: z.output<S>) => Promise<CallToolResult>;
}

const defineTool = <S extends AnyObjectSchema>(tool: ToolDefinition<S>): ToolDefinition => tool as unknown as ToolDefinition;

/** Section lists are capped so one whole-subject search cannot flood the model's context. */
const DEFAULT_SECTION_LIMIT = 40;
const MAX_SECTION_LIMIT = 150;
/** Live seat checks for conflicts never hold a tool call for long. */
const LIVE_TIMEOUT_MS = 10_000;

const text = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

export const toolError = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

const SCOPE_HELP: Record<Exclude<Scope, "read">, string> = {
  "watches:write": "Manage tracked classes",
  "schedule:write": "Edit your schedule",
};

/** One line per zod issue, prefixed with its path. */
export const describeIssues = (error: z.ZodError): string =>
  error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");

/** Runs a tool body as `auth`, with scope, rate-limit and error handling around it. */
export async function runAs(
  auth: ToolAuth,
  scope: ToolScope,
  body: (auth: ToolAuth) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  if (scope === "site") {
    if (!auth.site) {
      return toolError(
        "This tool only works in the assistant on the PantherWatch site. Nothing was changed. The student can " +
          "set their campus under Settings → Campus on PantherWatch.",
      );
    }
  } else if (!auth.scopes.includes(scope)) {
    const label = scope === "read" ? "See your classes" : SCOPE_HELP[scope];
    return toolError(
      `This PantherWatch connection doesn't have "${label}" permission (${scope}). Ask the user to disconnect and ` +
        `reconnect PantherWatch, leaving "${label}" ticked on the consent page. Nothing was changed.`,
    );
  }
  const wait = toolLimiter.take(auth.userId);
  if (wait > 0) return toolError(`Too many PantherWatch requests. Wait about ${wait} seconds, then try again.`);
  try {
    return await body(auth);
  } catch (error) {
    if (error instanceof WatchError || error instanceof ScheduleError) return toolError(error.message);
    if (error instanceof z.ZodError) return toolError(describeIssues(error));
    if (isUpstreamError(error)) {
      return toolError("GoSolar (GSU's registration system) is not responding right now. Try again in a minute.");
    }
    console.error("tool failed", error);
    return toolError("Something went wrong on PantherWatch's side. Try again in a moment.");
  }
}

// ------------------------------------------------------------------------------------------
// Links into the site, so an assistant can send the student to the full view
// ------------------------------------------------------------------------------------------

const absolute = (path: string): string => `${env.APP_URL}${path}`;

/** The course results page for one subject (and course number), exactly as the search form builds it. */
export const resultsUrl = (term: string, subject: string, courseNumber?: string | null, level?: string | null): string =>
  absolute(resultsHref({ term, subjects: [subject], courseNumber: courseNumber ?? null, level: level ?? null }));

/** The results page with one section's details dialog open (the results list links sections the same way). */
const sectionUrl = (term: string, subject: string, courseNumber: string, crn: string): string =>
  `${resultsUrl(term, subject, courseNumber)}&crn=${crn}`;

export const trackedClassesUrl = (): string => absolute("/tracked-classes");

export const scheduleUrl = (term: string): string => absolute(`/schedule-builder?${new URLSearchParams({ term }).toString()}`);

// ------------------------------------------------------------------------------------------

/**
 * search_sections always searches one GoSolar `txt_level` (src/lib/account/levels.ts). Without a
 * level GoSolar returns every level, and a Perimeter College (associate) section looks like any
 * other (both levels have "Online" campuses). The level is the tool's `level` input, else the
 * student's saved campus, else bachelor's.
 */
type LevelSource = "input" | "preference" | "default";

/**
 * How many sections the same search finds at another level, for the "also at Perimeter" hint.
 * Same GoSolar options with the live-check timeout cap; a failure is logged and returns null
 * (the hint is left out rather than reported as zero).
 */
async function countAtLevel(
  search: { term: string; subject: string; courseNumber?: string },
  level: LevelPreference,
): Promise<number | null> {
  const options = gosolarOptions();
  try {
    return await countSections(
      { ...search, level },
      { ...options, timeoutMs: Math.min(options?.timeoutMs ?? LIVE_TIMEOUT_MS, LIVE_TIMEOUT_MS) },
    );
  } catch (error) {
    console.warn(
      `tools: GoSolar ${level} count failed for ${search.term} ${search.subject} ${search.courseNumber ?? ""}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

const termInput = termCodeSchema.describe('6-digit term code from list_terms, e.g. "202701" (Spring 2027).');
const crnInput = crnSchema.describe('5-digit CRN, e.g. "19010".');
const subjectInput = subjectSchema.describe('Subject code, e.g. "CSC".');
const courseNumberInput = courseNumberSchema.describe('Course number, e.g. "1301" or "1301L".');

/** Live sections for (subject, courseNumber, crn) triples of one term. `failed` lists CRNs whose search failed. */
async function liveSections(
  term: string,
  items: ReadonlyArray<{ crn: string; subject: string; courseNumber: string }>,
): Promise<{ sections: Map<string, CourseData>; failed: string[] }> {
  const groups = new Map<string, CourseGroup>();
  for (const item of items) {
    const key = `${item.subject}|${item.courseNumber}`;
    const group = groups.get(key) ?? { subject: item.subject, courseNumber: item.courseNumber, crns: [] };
    if (!group.crns.includes(item.crn)) group.crns.push(item.crn);
    groups.set(key, group);
  }
  const failed: string[] = [];
  const options = gosolarOptions();
  const sections = await findSectionsByCrn(term, [...groups.values()], {
    ...options,
    concurrency: 4,
    timeoutMs: Math.min(options?.timeoutMs ?? LIVE_TIMEOUT_MS, LIVE_TIMEOUT_MS),
    onError: (group, error) => {
      failed.push(...group.crns);
      console.warn(`tools: GoSolar search failed for ${term} ${group.subject} ${group.courseNumber}:`, error instanceof Error ? error.message : error);
    },
  });
  return { sections, failed };
}

/** Subject and course number of a CRN on the user's schedule or tracked list (GoSolar can't look a CRN up alone). */
export async function courseOfSaved(userId: string, term: string, crn: string): Promise<{ subject: string; courseNumber: string } | null> {
  const [schedule, watches] = await Promise.all([listSchedule(userId), listWatches(userId)]);
  const saved = [...(schedule[term] ?? []), ...watches.filter((w) => w.term === term)].find((e) => e.crn === crn);
  return saved ? { subject: saved.subject, courseNumber: saved.courseNumber } : null;
}

/**
 * The term the course search form preselects (CourseSearchForm: the newest term open for
 * registration, else the newest term), so the assistant defaults to what the site does.
 */
export const defaultTermCode = (terms: readonly TermInfo[]): string | undefined =>
  [...terms].sort((a, b) => b.code.localeCompare(a.code)).find((t) => !t.viewOnly)?.code ??
  [...terms].sort((a, b) => b.code.localeCompare(a.code))[0]?.code;

/** Term codes are YYYYMM of the start month: started once that month begins (GSU's local date). */
function termStarted(code: string, now: Date = new Date()): boolean {
  const today = nyDateParts(now);
  return today.year * 100 + today.month >= Number(code);
}

/** The newest term that has started: the semester under way. */
const inProgressTermCode = (terms: readonly TermInfo[]): string | undefined =>
  terms.map((t) => t.code).filter((code) => termStarted(code)).sort((a, b) => b.localeCompare(a))[0];

const describeConflict = (conflict: Conflict) => ({
  crns: conflict.crns,
  courses: conflict.sections.map((s) => `${s.subject ?? ""} ${s.courseNumber ?? ""}`.trim()),
  when: conflict.label,
});

export const TOOLS: readonly ToolDefinition[] = [
  // ------------------------------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------------------------------

  defineTool({
    name: "list_terms",
    title: "List terms",
    description:
      "Georgia State terms in GoSolar. Terms open for registration come first (newest first), then view-only past " +
      "terms. `default: true` marks the term students are registering for now (PantherWatch's own default); use it " +
      "when the user doesn't name a term. `status` is upcoming, in_progress (the semester under way) or past. Use " +
      "the `code` in every other tool; match the user's words (\"spring\", \"next semester\") to a name.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "read",
    handler: async () => {
      const terms = await getTerms({ memo: true });
      const fallback = defaultTermCode(terms);
      const inProgress = inProgressTermCode(terms);
      return text({
        terms: terms.map((t) => ({
          code: t.code,
          name: termName(t.code, t.description),
          registrationOpen: !t.viewOnly,
          status: t.code === inProgress ? "in_progress" : termStarted(t.code) ? "past" : "upcoming",
          ...(t.code === fallback ? { default: true } : {}),
        })),
      });
    },
  }),

  defineTool({
    name: "search_subjects",
    title: "Find subject codes",
    description: 'Subject codes whose code or name contains `query` (e.g. "psych" -> PSYC). At most 50.',
    inputSchema: z.object({
      term: termInput,
      query: z.string().trim().max(64).default("").describe("Text to match; blank lists the first 50 subjects."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "read",
    handler: async (_auth, { term, query }) => text({ subjects: await searchSubjects({ term, query }) }),
  }),

  defineTool({
    name: "search_sections",
    title: "Search sections",
    description:
      "Live sections of one subject (optionally one course number) in a term, straight from GoSolar: CRN, title, " +
      "instructor, credits, seats, waitlist, meetings and delivery mode. `seatsAvailable` is what a student can " +
      "actually take (cross-listed seat pools included); `open` means a free seat and an empty waitlist. Meeting " +
      "`days` use M T W R F S U; `start`/`end` are 24-hour HHMM, null when TBA or asynchronous. One subject per " +
      "call; omit courseNumber for the whole subject (results are capped by `limit`). Searches one degree level: " +
      "`level` when given, else the student's saved campus, else bachelor's; `level`, `levelName` and " +
      "`levelSource` (input, preference or default) in the result say which. With `levelSource: \"default\"` the " +
      "result also has `alsoAtAssociateLevel` (sections of the same search at Perimeter College, 0 when none) and, " +
      "when nothing was found, `alsoAtGraduateLevel`; missing means that check failed. `resultsUrl` opens " +
      "the same search on PantherWatch, with every section and its filters. Search the courses the student names; " +
      "PantherWatch doesn't know their degree requirements, so don't search for other courses to suggest as " +
      "requirement fillers.",
    inputSchema: z.object({
      term: termInput,
      subject: subjectInput,
      courseNumber: courseNumberInput.optional(),
      level: z
        .enum(LEVEL_PREFERENCES)
        .optional()
        .describe(
          "US = bachelor's level (Atlanta campus and online), UA = associate level at Perimeter College " +
            "campuses, GS = graduate. Omit it to use the student's saved campus (bachelor's when none is saved); " +
            "pass it when the student says which level or campus they want.",
        ),
      openOnly: z.boolean().default(false).describe("Only sections with an open seat and no waitlist."),
      limit: z.number().int().min(1).max(MAX_SECTION_LIMIT).default(DEFAULT_SECTION_LIMIT),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "read",
    handler: async ({ userId }, { term, subject, courseNumber, level: requested, openOnly, limit }) => {
      const saved = requested ? null : await getLevelPreference(userId);
      const level: LevelPreference = requested ?? saved ?? DEFAULT_LEVEL;
      const levelSource: LevelSource = requested ? "input" : saved ? "preference" : "default";
      // Only when nobody chose the level: does the same search find Perimeter (or graduate) sections?
      // The Perimeter count runs alongside the search (its own GoSolar session); the graduate one
      // only when the search found nothing.
      const search = { term, subject, courseNumber };
      const associateCount = levelSource === "default" ? countAtLevel(search, "UA") : null;
      // (countAtLevel never rejects, so a failed search leaves no unhandled rejection behind.)
      const all = (await searchSections({ term, subject, courseNumber, level })).map(compactSection);
      const matching = openOnly ? all.filter((s) => s.open) : all;

      const elsewhere: { alsoAtAssociateLevel?: number; alsoAtGraduateLevel?: number } = {};
      if (levelSource === "default") {
        const [associate, graduate] = await Promise.all([associateCount, all.length === 0 ? countAtLevel(search, "GS") : null]);
        if (associate !== null) elsewhere.alsoAtAssociateLevel = associate;
        if (graduate !== null) elsewhere.alsoAtGraduateLevel = graduate;
      }

      return text({
        level,
        levelName: LEVEL_NAMES[level],
        levelSource,
        ...elsewhere,
        total: matching.length,
        returned: Math.min(limit, matching.length),
        truncated: matching.length > limit,
        resultsUrl: resultsUrl(term, subject, courseNumber, level),
        sections: matching.slice(0, limit),
      });
    },
  }),

  defineTool({
    name: "get_section_details",
    title: "Grades, rating and syllabus",
    description:
      "For one section: GSU grade history for the course (course-wide and this instructor's own, GPA and D/F/W " +
      "rate), the instructor's RateMyProfessors summary, and the syllabus link when one is published. A missing " +
      "rating means unknown, not bad. Pass `instructor` (from search_sections) to skip a GoSolar lookup. " +
      "`sectionUrl` opens this section on PantherWatch. When `syllabusUrl` is set, get_syllabus_summary reads it " +
      "(grading, exams, attendance, textbook); `syllabusSummaryCached: true` means a summary is already stored.",
    inputSchema: z.object({
      term: termInput,
      subject: subjectInput,
      courseNumber: courseNumberInput,
      crn: crnInput,
      instructor: z.string().trim().max(200).optional().describe('Instructor as search_sections shows it, "Last, First".'),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "read",
    handler: async (_auth, { term, subject, courseNumber, crn, instructor }) => {
      let section: CourseData | undefined;
      let name = instructor ?? null;
      if (!name) {
        section = (await searchSections({ term, subject, courseNumber })).find((s) => s.courseReferenceNumber === crn);
        if (!section) return toolError(`GoSolar doesn't list CRN ${crn} for ${subject} ${courseNumber} in ${term}.`);
        name = instructorOf(section);
      }
      const meta = await getSectionMeta({ term, subject, courseNumber, crn, instructor: name });
      // A cache lookup only: summaries are generated by get_syllabus_summary, never here.
      const syllabusSummaryCached = meta.syllabus ? await hasStoredSummary(meta.syllabus.url).catch(() => false) : undefined;
      return text({
        ...(section ? { section: compactSection(section) } : { instructor: name }),
        ...compactMeta(meta, { syllabusSummaryCached }),
        sectionUrl: sectionUrl(term, subject, courseNumber, crn),
      });
    },
  }),

  defineTool({
    name: "get_course_requirements",
    title: "Prerequisites and restrictions",
    description:
      "Prerequisites, corequisites, registration restrictions and catalog description of one section, from " +
      "GoSolar. Call it to answer \"can I take this?\", \"what do I need first?\", \"who is allowed to register?\" " +
      "or \"what is this class about?\" (sections of one course normally share them; search_sections gives a " +
      "CRN). `prerequisites.text` is GoSolar's own wording and the authority on and/or grouping; `items` lists " +
      "every course in it, with minimum grade and whether it may be taken concurrently. `restrictions` say who " +
      "may register (level, major, college, classification and so on), not seats: the student must match one " +
      "value of each `mustBe` group and none of `mustNotBe`; `specialApprovals` need department permission. " +
      "PantherWatch doesn't know what the student has taken. Pass subject and courseNumber to get `sectionUrl`. " +
      "Explain what the requirements say; never tell the student they are or aren't eligible, and don't use them " +
      "to suggest other courses (PantherWatch doesn't know the student's degree requirements).",
    inputSchema: z.object({
      term: termInput,
      crn: crnInput,
      subject: subjectInput.optional(),
      courseNumber: courseNumberInput.optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "read",
    handler: async ({ userId }, { term, crn, subject, courseNumber }) => {
      const [requirements, course] = await Promise.all([
        getSectionRequirements({ term, crn }),
        subject && courseNumber ? { subject, courseNumber } : courseOfSaved(userId, term, crn),
      ]);
      return text({
        ...compactRequirements(requirements),
        ...(course ? { sectionUrl: sectionUrl(term, course.subject, course.courseNumber, crn) } : {}),
      });
    },
  }),

  defineTool({
    name: "get_syllabus_summary",
    title: "Syllabus summary",
    description:
      "A summary of the syllabus PDF the department posted for one section: grading components and weights, " +
      "exam and quiz counts, attendance and late-work policies, textbook (and cost notes), major projects, " +
      "workload, modality notes and cautions. Call it when comparing sections or professors of a course, or for " +
      "\"what's the workload\", \"how is it graded\", \"is attendance required\" or \"what textbook\" (call it " +
      "for several sections in parallel). It is AI-written from the PDF's text, and the PDF may be from an earlier " +
      "term: `termLabel` is the term the syllabus itself names (null if it doesn't), `summarizedAt` and " +
      "`textUnchangedSince` say how fresh it is, and `stale: true` means the live PDF couldn't be re-checked. Null " +
      "fields mean the syllabus doesn't say. `unavailable` (with `message`) when no syllabus is posted or it can't " +
      "be read. Pass subject and courseNumber to get `sectionUrl`.",
    inputSchema: z.object({
      term: termInput,
      crn: crnInput,
      subject: subjectInput.optional(),
      courseNumber: courseNumberInput.optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "read",
    handler: async (_auth, { term, crn, subject, courseNumber }) => {
      const link = subject && courseNumber ? { sectionUrl: sectionUrl(term, subject, courseNumber, crn) } : {};
      const syllabus = await getSyllabus(term, crn);
      if (!syllabus) {
        return text({
          term,
          crn,
          syllabusUrl: null,
          unavailable: "no_syllabus",
          message: `No syllabus is posted for CRN ${crn} in ${termLabel(term)}.`,
          ...link,
        });
      }
      const result = await summarizeSyllabus(syllabus.url);
      if (result.status === "unavailable") {
        return text({ term, crn, syllabusUrl: syllabus.url, unavailable: result.reason, message: result.message, ...link });
      }
      const { termLabel: syllabusTerm, ...summary } = result.summary;
      // Older uploads keep the term they were filed under in the path ("syllabi/202508/83410.pdf").
      const filedUnder = /\/syllabi\/(\d{6})\//.exec(syllabus.url)?.[1];
      return text({
        term,
        crn,
        syllabusUrl: syllabus.url,
        termLabel: syllabusTerm,
        ...(filedUnder && filedUnder !== term ? { filedUnderTerm: termLabel(filedUnder) } : {}),
        summary,
        summarizedAt: result.summarizedAt.toISOString(),
        textUnchangedSince: result.textUnchangedSince.toISOString(),
        ...(result.stale ? { stale: true, staleReason: result.stale.message } : {}),
        ...(result.truncated ? { note: "The syllabus is long; only its first part was summarized." } : {}),
        ...link,
      });
    },
  }),

  defineTool({
    name: "list_watches",
    title: "List tracked classes",
    description:
      "The user's tracked sections (seat alerts), newest first. `alertSent` means an open-seat email already went " +
      "out for the current opening (it re-arms after the section fills again). Set includeSeats for live seat counts " +
      "(one GoSolar search per course). `trackedClassesUrl` is the Tracked classes page.",
    inputSchema: z.object({ includeSeats: z.boolean().default(false) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    scope: "read",
    handler: async ({ userId }, { includeSeats }) => {
      const shape = (w: Awaited<ReturnType<typeof listWatches>>[number]) => ({
        term: w.term,
        crn: w.crn,
        subject: w.subject,
        courseNumber: w.courseNumber,
        title: w.courseTitle,
        instructor: w.instructor,
        alertSent: w.notifiedAt !== null,
        trackedSince: w.createdAt,
      });
      if (!includeSeats) return text({ watches: (await listWatches(userId)).map(shape), trackedClassesUrl: trackedClassesUrl() });
      const { items } = await listWatchesWithDetails(userId, { deadlineMs: 15_000 });
      return text({
        watches: items.map((item) => ({
          ...shape(item.watch),
          live: item.section
            ? (({ seatsAvailable, waitCount, open }) => ({ seatsAvailable, waitCount, open }))(compactSection(item.section))
            : null,
          ...(item.partial ? { note: "GoSolar didn't answer for this course; try again later." } : {}),
          ...(item.unlisted ? { note: "GoSolar no longer lists this section (cancelled or renumbered)." } : {}),
        })),
        trackedClassesUrl: trackedClassesUrl(),
      });
    },
  }),

  defineTool({
    name: "list_schedule",
    title: "List schedule",
    description:
      "The sections on the user's PantherWatch schedule, grouped by term (newest term first). Each term's " +
      "`scheduleUrl` opens it in the Schedule builder.",
    inputSchema: z.object({ term: termInput.optional().describe("Only this term.") }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    scope: "read",
    handler: async ({ userId }, { term }) => {
      const schedule = await listSchedule(userId);
      const terms = Object.entries(schedule)
        .filter(([code]) => !term || code === term)
        .map(([code, entries]) => ({
          term: code,
          scheduleUrl: scheduleUrl(code),
          sections: entries.map((e) => ({ crn: e.crn, subject: e.subject, courseNumber: e.courseNumber, title: e.courseTitle })),
        }));
      return text({ terms });
    },
  }),

  defineTool({
    name: "check_conflicts",
    title: "Check time conflicts",
    description:
      "Whether sections clash in time, using live GoSolar meeting times. CRNs already on the user's schedule or " +
      "tracked list are looked up automatically; for any other CRN also pass it in `sections` with its subject and " +
      "course number (GoSolar can't look a CRN up on its own). Back-to-back meetings and different date ranges " +
      "(first vs second half of term) don't clash; TBA/asynchronous meetings never do.",
    inputSchema: z.object({
      term: termInput,
      crns: z.array(crnInput).min(2).max(20),
      sections: z
        .array(z.object({ crn: crnInput, subject: subjectInput, courseNumber: courseNumberInput }))
        .max(20)
        .default([]),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    scope: "read",
    handler: async ({ userId }, { term, crns, sections: given }) => {
      const known = new Map<string, { crn: string; subject: string; courseNumber: string }>();
      for (const s of given) known.set(s.crn, s);
      const [schedule, watches] = await Promise.all([listSchedule(userId), listWatches(userId)]);
      for (const e of [...(schedule[term] ?? []), ...watches.filter((w) => w.term === term)]) {
        if (!known.has(e.crn)) known.set(e.crn, { crn: e.crn, subject: e.subject, courseNumber: e.courseNumber });
      }
      const wanted = [...new Set(crns)];
      const unresolved = wanted.filter((crn) => !known.has(crn));
      const lookups = wanted.filter((crn) => known.has(crn)).map((crn) => known.get(crn)!);
      const { sections, failed } = await liveSections(term, lookups);
      const found = wanted.map((crn) => sections.get(crn)).filter((s): s is CourseData => s !== undefined);
      const notListed = lookups.map((l) => l.crn).filter((crn) => !sections.has(crn) && !failed.includes(crn));
      return text({
        conflicts: findConflicts(found).map(describeConflict),
        checked: found.map((s) => s.courseReferenceNumber),
        ...(unresolved.length ? { unresolved, unresolvedNote: "Pass these in `sections` with subject and courseNumber." } : {}),
        ...(notListed.length ? { notListed } : {}),
        ...(failed.length ? { lookupFailed: failed } : {}),
      });
    },
  }),

  // ------------------------------------------------------------------------------------------
  // Write: tracked classes
  // ------------------------------------------------------------------------------------------

  defineTool({
    name: "add_watch",
    title: "Track a section",
    description:
      "Starts a seat alert: PantherWatch emails the user when a seat opens in this section. If the section is " +
      "open right now no email is sent for this opening (openNow: true); the first alert comes after it fills " +
      "and reopens. Tracking the same section again changes nothing. Only terms open for registration.",
    inputSchema: z.object({
      term: termInput,
      crn: crnInput,
      subject: subjectInput,
      courseNumber: courseNumberInput,
      courseTitle: z.string().trim().max(200).optional(),
      instructor: z.string().trim().max(200).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    scope: "watches:write",
    handler: async ({ userId }, input) => {
      const result = await addWatch(userId, input);
      return text({
        created: result.created,
        openNow: result.openNow,
        message: result.created ? watchAddedBody(result.openNow) : "Already tracking this section; nothing changed.",
        watch: { term: result.watch.term, crn: result.watch.crn, subject: result.watch.subject, courseNumber: result.watch.courseNumber },
        trackedClassesUrl: trackedClassesUrl(),
      });
    },
  }),

  defineTool({
    name: "remove_watch",
    title: "Stop tracking a section",
    description: "Stops the seat alert for (term, crn). removed: false means it wasn't being tracked.",
    inputSchema: z.object({ term: termInput, crn: crnInput }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    scope: "watches:write",
    handler: async ({ userId }, { term, crn }) => {
      const removed = await removeWatch(userId, term, crn);
      return text({
        removed,
        message: removed ? "Stopped tracking this section." : "This section wasn't being tracked.",
        trackedClassesUrl: trackedClassesUrl(),
      });
    },
  }),

  // ------------------------------------------------------------------------------------------
  // Write: schedule
  // ------------------------------------------------------------------------------------------

  defineTool({
    name: "add_to_schedule",
    title: "Add to schedule",
    description:
      "Adds a section to the user's PantherWatch schedule (a plan; it does not register in GoSolar). It is added " +
      "even when it clashes; `conflicts` lists clashes with sections already scheduled that term (null when live " +
      "times couldn't be checked).",
    inputSchema: z.object({
      term: termInput,
      crn: crnInput,
      subject: subjectInput,
      courseNumber: courseNumberInput,
      courseTitle: z.string().trim().max(200).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    scope: "schedule:write",
    handler: async ({ userId }, input) => {
      const existing = ((await listSchedule(userId))[input.term] ?? []).filter((e) => e.crn !== input.crn);
      const { entry, created } = await addEntry(userId, input);
      let conflicts: ReturnType<typeof describeConflict>[] | null = null;
      let note: string | undefined;
      const { sections, failed } = await liveSections(input.term, [
        { crn: entry.crn, subject: entry.subject, courseNumber: entry.courseNumber },
        ...existing.map((e) => ({ crn: e.crn, subject: e.subject, courseNumber: e.courseNumber })),
      ]);
      const candidate = sections.get(entry.crn);
      if (failed.length) note = "Couldn't reach GoSolar for some sections, so conflicts may be incomplete.";
      if (candidate) {
        const others = existing.map((e) => sections.get(e.crn)).filter((s): s is CourseData => s !== undefined);
        conflicts = findConflictsWith(candidate, others).map(describeConflict);
      } else if (!note) {
        note = "GoSolar doesn't list this CRN for that course, so its times couldn't be checked.";
      }
      return text({
        created,
        message: created ? "Added to the schedule." : "Already on the schedule; updated.",
        entry: { term: entry.term, crn: entry.crn, subject: entry.subject, courseNumber: entry.courseNumber },
        conflicts,
        ...(note ? { note } : {}),
        scheduleUrl: scheduleUrl(entry.term),
      });
    },
  }),

  defineTool({
    name: "remove_from_schedule",
    title: "Remove from schedule",
    description: "Removes (term, crn) from the user's PantherWatch schedule. removed: false means it wasn't there.",
    inputSchema: z.object({ term: termInput, crn: crnInput }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    scope: "schedule:write",
    handler: async ({ userId }, { term, crn }) => {
      const removed = await removeEntry(userId, term, crn);
      return text({
        removed,
        message: removed ? "Removed from the schedule." : "That section wasn't on the schedule.",
        scheduleUrl: scheduleUrl(term),
      });
    },
  }),

  // ------------------------------------------------------------------------------------------
  // Account (on-site assistant only: there is no OAuth scope for account settings)
  // ------------------------------------------------------------------------------------------

  defineTool({
    name: "set_level_preference",
    title: "Save campus",
    description:
      "Saves the student's campus (degree level) on their PantherWatch account: US = Atlanta campus or online " +
      "(bachelor's), UA = Perimeter College (associate), GS = graduate. search_sections and the site's course " +
      "search then use it whenever no level is given. Call it when the student tells you which one they attend, " +
      "not to look at another level once (pass `level` to search_sections for that). They can change it under " +
      "Settings → Campus.",
    inputSchema: z.object({
      level: z
        .enum(LEVEL_PREFERENCES)
        .describe("US = bachelor's (Atlanta campus or online), UA = associate (Perimeter College), GS = graduate."),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    scope: "site",
    handler: async ({ userId }, { level }) => {
      if (!(await setLevelPreference(userId, level))) return toolError("The PantherWatch account wasn't found.");
      const campus = CAMPUS_OPTIONS.find((option) => option.value === level)?.label ?? LEVEL_NAMES[level];
      return text({
        saved: true,
        level,
        levelName: LEVEL_NAMES[level],
        message: `Saved: ${campus}. search_sections uses it from now on when no level is given.`,
        settingsUrl: absolute("/settings"),
      });
    },
  }),
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export const toolByName = (name: string): ToolDefinition | undefined => BY_NAME.get(name);

/**
 * Validates `rawInput` against the tool's schema, then runs it as `auth`. For callers that do not
 * validate themselves (the on-site assistant; the MCP server validates before its callback).
 * Unknown tools and invalid input are tool errors, so the model can correct itself.
 */
export async function callTool(auth: ToolAuth, name: string, rawInput: unknown): Promise<CallToolResult> {
  const tool = toolByName(name);
  if (!tool) return toolError(`There is no tool named "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.`);
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) return toolError(`Invalid arguments for ${name}: ${describeIssues(parsed.error)}`);
  return runAs(auth, tool.scope, (a) => tool.handler(a, parsed.data));
}
