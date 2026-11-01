import "server-only";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  courseNumberSchema,
  crnSchema,
  getSectionMeta,
  getTerms,
  gosolarOptions,
  isUpstreamError,
  searchSections,
  searchSubjects,
  subjectSchema,
  termCodeSchema,
} from "@/lib/courses";
import { instructorOf, termName } from "@/lib/format";
import { findSectionsByCrn, type CourseData, type CourseGroup } from "@/lib/gosolar";
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
import { compactMeta, compactSection } from "./format";

/**
 * The PantherWatch MCP tools. Every call is authenticated (withMcpAuth put the verified token
 * on `ctx.http.authInfo`, with the user id in `extra.userId`), rate-limited per user, and
 * scope-checked: writes need `watches:write` / `schedule:write`. A missing scope is a tool
 * error that tells the assistant how the user can grant it, not an HTTP 403 step-up challenge,
 * because the consent page lets users deliberately leave write access off.
 */

export interface ToolAuth {
  userId: string;
  scopes: readonly Scope[];
}

/** Section lists are capped so one whole-subject search cannot flood the model's context. */
const DEFAULT_SECTION_LIMIT = 40;
const MAX_SECTION_LIMIT = 150;
/** Live seat checks for conflicts never hold a tool call for long. */
const LIVE_TIMEOUT_MS = 10_000;

const text = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const toolError = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

const SCOPE_HELP: Record<Exclude<Scope, "read">, string> = {
  "watches:write": "Manage tracked classes",
  "schedule:write": "Edit your schedule",
};

function authOf(ctx: ServerContext): ToolAuth | null {
  const info = ctx.http?.authInfo;
  const userId = info?.extra?.userId;
  if (!info || typeof userId !== "string") return null;
  return { userId, scopes: info.scopes as Scope[] };
}

/** Runs a tool body with auth, scope, rate-limit and error handling around it. */
async function run(
  ctx: ServerContext,
  scope: Scope,
  body: (auth: ToolAuth) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const auth = authOf(ctx);
  if (!auth) return toolError("Not signed in to PantherWatch. Reconnect the PantherWatch connector.");
  if (!auth.scopes.includes(scope)) {
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
    if (error instanceof z.ZodError) {
      return toolError(error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    if (isUpstreamError(error)) {
      return toolError("GoSolar (GSU's registration system) is not responding right now. Try again in a minute.");
    }
    console.error("mcp tool failed", error);
    return toolError("Something went wrong on PantherWatch's side. Try again in a moment.");
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
      console.warn(`mcp: GoSolar search failed for ${term} ${group.subject} ${group.courseNumber}:`, error instanceof Error ? error.message : error);
    },
  });
  return { sections, failed };
}

const describeConflict = (conflict: Conflict) => ({
  crns: conflict.crns,
  courses: conflict.sections.map((s) => `${s.subject ?? ""} ${s.courseNumber ?? ""}`.trim()),
  when: conflict.label,
});

export function registerTools(server: McpServer): void {
  // ------------------------------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------------------------------

  server.registerTool(
    "list_terms",
    {
      title: "List terms",
      description:
        "Georgia State terms in GoSolar. Terms open for registration come first (newest first), then view-only past " +
        "terms. Use the `code` in every other tool; match the user's words (\"spring\", \"next semester\") to a description.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (_args, ctx) =>
      run(ctx, "read", async () => {
        const terms = await getTerms();
        return text({ terms: terms.map((t) => ({ code: t.code, name: termName(t.code, t.description), registrationOpen: !t.viewOnly })) });
      }),
  );

  server.registerTool(
    "search_subjects",
    {
      title: "Find subject codes",
      description: 'Subject codes whose code or name contains `query` (e.g. "psych" -> PSYC). At most 50.',
      inputSchema: z.object({
        term: termInput,
        query: z.string().trim().max(64).default("").describe("Text to match; blank lists the first 50 subjects."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ term, query }, ctx) =>
      run(ctx, "read", async () => text({ subjects: await searchSubjects({ term, query }) })),
  );

  server.registerTool(
    "search_sections",
    {
      title: "Search sections",
      description:
        "Live sections of one subject (optionally one course number) in a term, straight from GoSolar: CRN, title, " +
        "instructor, credits, seats, waitlist, meetings and delivery mode. `seatsAvailable` is what a student can " +
        "actually take (cross-listed seat pools included); `open` means a free seat and an empty waitlist. Meeting " +
        "`days` use M T W R F S U; `start`/`end` are 24-hour HHMM, null when TBA or asynchronous. One subject per " +
        "call; omit courseNumber for the whole subject (results are capped by `limit`).",
      inputSchema: z.object({
        term: termInput,
        subject: subjectInput,
        courseNumber: courseNumberInput.optional(),
        level: z.enum(["US", "GS"]).optional().describe("US undergraduate, GS graduate. Omit for both."),
        openOnly: z.boolean().default(false).describe("Only sections with an open seat and no waitlist."),
        limit: z.number().int().min(1).max(MAX_SECTION_LIMIT).default(DEFAULT_SECTION_LIMIT),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ term, subject, courseNumber, level, openOnly, limit }, ctx) =>
      run(ctx, "read", async () => {
        const all = (await searchSections({ term, subject, courseNumber, level })).map(compactSection);
        const matching = openOnly ? all.filter((s) => s.open) : all;
        return text({
          total: matching.length,
          returned: Math.min(limit, matching.length),
          truncated: matching.length > limit,
          sections: matching.slice(0, limit),
        });
      }),
  );

  server.registerTool(
    "get_section_details",
    {
      title: "Grades, rating and syllabus",
      description:
        "For one section: GSU grade history for the course (course-wide and this instructor's own, GPA and D/F/W " +
        "rate), the instructor's RateMyProfessors summary, and the syllabus link when one is published. A missing " +
        "rating means unknown, not bad. Pass `instructor` (from search_sections) to skip a GoSolar lookup.",
      inputSchema: z.object({
        term: termInput,
        subject: subjectInput,
        courseNumber: courseNumberInput,
        crn: crnInput,
        instructor: z.string().trim().max(200).optional().describe('Instructor as search_sections shows it, "Last, First".'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ term, subject, courseNumber, crn, instructor }, ctx) =>
      run(ctx, "read", async () => {
        let section: CourseData | undefined;
        let name = instructor ?? null;
        if (!name) {
          section = (await searchSections({ term, subject, courseNumber })).find((s) => s.courseReferenceNumber === crn);
          if (!section) return toolError(`GoSolar doesn't list CRN ${crn} for ${subject} ${courseNumber} in ${term}.`);
          name = instructorOf(section);
        }
        const meta = await getSectionMeta({ term, subject, courseNumber, crn, instructor: name });
        return text({ ...(section ? { section: compactSection(section) } : { instructor: name }), ...compactMeta(meta) });
      }),
  );

  server.registerTool(
    "list_watches",
    {
      title: "List tracked classes",
      description:
        "The user's tracked sections (seat alerts), newest first. `alertSent` means an open-seat email already went " +
        "out for the current opening (it re-arms after the section fills again). Set includeSeats for live seat counts " +
        "(one GoSolar search per course).",
      inputSchema: z.object({ includeSeats: z.boolean().default(false) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ includeSeats }, ctx) =>
      run(ctx, "read", async ({ userId }) => {
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
        if (!includeSeats) return text({ watches: (await listWatches(userId)).map(shape) });
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
        });
      }),
  );

  server.registerTool(
    "list_schedule",
    {
      title: "List schedule",
      description: "The sections on the user's PantherWatch schedule, grouped by term (newest term first).",
      inputSchema: z.object({ term: termInput.optional().describe("Only this term.") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ term }, ctx) =>
      run(ctx, "read", async ({ userId }) => {
        const schedule = await listSchedule(userId);
        const terms = Object.entries(schedule)
          .filter(([code]) => !term || code === term)
          .map(([code, entries]) => ({
            term: code,
            sections: entries.map((e) => ({ crn: e.crn, subject: e.subject, courseNumber: e.courseNumber, title: e.courseTitle })),
          }));
        return text({ terms });
      }),
  );

  server.registerTool(
    "check_conflicts",
    {
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
    },
    async ({ term, crns, sections: given }, ctx) =>
      run(ctx, "read", async ({ userId }) => {
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
          ...(unresolved.length
            ? { unresolved, unresolvedNote: "Pass these in `sections` with subject and courseNumber." }
            : {}),
          ...(notListed.length ? { notListed } : {}),
          ...(failed.length ? { lookupFailed: failed } : {}),
        });
      }),
  );

  // ------------------------------------------------------------------------------------------
  // Write: tracked classes
  // ------------------------------------------------------------------------------------------

  server.registerTool(
    "add_watch",
    {
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
    },
    async (input, ctx) =>
      run(ctx, "watches:write", async ({ userId }) => {
        const result = await addWatch(userId, input);
        return text({
          created: result.created,
          openNow: result.openNow,
          message: result.created
            ? watchAddedBody(result.openNow)
            : "Already tracking this section; nothing changed.",
          watch: { term: result.watch.term, crn: result.watch.crn, subject: result.watch.subject, courseNumber: result.watch.courseNumber },
        });
      }),
  );

  server.registerTool(
    "remove_watch",
    {
      title: "Stop tracking a section",
      description: "Stops the seat alert for (term, crn). removed: false means it wasn't being tracked.",
      inputSchema: z.object({ term: termInput, crn: crnInput }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ term, crn }, ctx) =>
      run(ctx, "watches:write", async ({ userId }) => {
        const removed = await removeWatch(userId, term, crn);
        return text({ removed, message: removed ? "Stopped tracking this section." : "This section wasn't being tracked." });
      }),
  );

  // ------------------------------------------------------------------------------------------
  // Write: schedule
  // ------------------------------------------------------------------------------------------

  server.registerTool(
    "add_to_schedule",
    {
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
    },
    async (input, ctx) =>
      run(ctx, "schedule:write", async ({ userId }) => {
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
        });
      }),
  );

  server.registerTool(
    "remove_from_schedule",
    {
      title: "Remove from schedule",
      description: "Removes (term, crn) from the user's PantherWatch schedule. removed: false means it wasn't there.",
      inputSchema: z.object({ term: termInput, crn: crnInput }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ term, crn }, ctx) =>
      run(ctx, "schedule:write", async ({ userId }) => {
        const removed = await removeEntry(userId, term, crn);
        return text({ removed, message: removed ? "Removed from the schedule." : "That section wasn't on the schedule." });
      }),
  );
}

export const SERVER_INSTRUCTIONS =
  "PantherWatch: Georgia State University (GSU) course search, seat alerts and schedule planning for the signed-in " +
  "student. Start with list_terms to get term codes. search_sections reads live GoSolar data; call it once per " +
  "subject and filter locally instead of polling. To tell the student when a seat opens, use add_watch (email " +
  "alerts) rather than checking seats repeatedly. The schedule is a plan inside PantherWatch: it never registers " +
  "the student in GoSolar. PantherWatch is not affiliated with GSU; GoSolar is the source of truth.";
