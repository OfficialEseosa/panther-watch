import type { Metadata } from "next";
import { Suspense } from "react";
import { SchedulePlanner, type TermOption } from "@/components/schedule/SchedulePlanner";
import { SchedulePageSkeleton } from "@/components/schedule/ScheduleSkeleton";
import { requireUser } from "@/lib/auth/session";
import { getTerms, type TermInfo } from "@/lib/courses";
import { listSchedule } from "@/lib/schedule";
import { listWatches } from "@/lib/watches";
import { resolveScheduleSections } from "@/components/schedule/resolve.server";
import { nyDateParts, termLabel } from "@/lib/format";

/** GoSolar lookups for the calendar are capped at 10 s (resolve.server.ts); this leaves room for the rest. */
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Schedule builder",
  description: "Plan your week, catch overlapping classes, and export your schedule to a calendar.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** GoSolar term code for the semester in progress at GSU (01 Spring, 05 Summer, 08 Fall). */
function localCurrentTerm(now = new Date()): string {
  const { year, month } = nyDateParts(now);
  const season = month >= 8 ? "08" : month >= 5 ? "05" : "01";
  return `${year}${season}`;
}

/** Terms with schedule entries plus the open registration terms, newest first. */
function buildTermOptions(scheduleTerms: string[], terms: TermInfo[] | null): TermOption[] {
  const byCode = new Map<string, TermOption>();
  if (terms) {
    for (const t of terms) if (!t.viewOnly) byCode.set(t.code, { code: t.code, label: termLabel(t.code), viewOnly: false });
    for (const code of scheduleTerms) {
      if (byCode.has(code)) continue;
      // Listed as view-only, or no longer offered at all: either way it can't take new classes.
      byCode.set(code, { code, label: termLabel(code), viewOnly: true });
    }
  } else {
    // The term list is down: offer the user's terms plus the current one, and let the API decide.
    for (const code of [...scheduleTerms, localCurrentTerm()]) byCode.set(code, { code, label: termLabel(code), viewOnly: false });
  }
  return [...byCode.values()].sort((a, b) => b.code.localeCompare(a.code));
}

function pickInitialTerm(options: TermOption[], schedule: Record<string, unknown[]>, requested: string | undefined): string {
  if (requested && options.some((o) => o.code === requested)) return requested;
  const hasEntries = (code: string) => (schedule[code]?.length ?? 0) > 0;
  return (
    options.find((o) => !o.viewOnly && hasEntries(o.code))?.code ??
    options.find((o) => !o.viewOnly)?.code ??
    options.find((o) => hasEntries(o.code))?.code ??
    options[0]?.code ??
    localCurrentTerm()
  );
}

async function ScheduleBuilderData({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const [schedule, terms, watches, params] = await Promise.all([
    listSchedule(user.id),
    getTerms().catch((error: unknown) => {
      console.warn("schedule builder: term list unavailable:", error instanceof Error ? error.message : error);
      return null;
    }),
    listWatches(user.id).catch(() => []),
    searchParams,
  ]);

  const requested = typeof params.term === "string" ? params.term : undefined;
  const termOptions = buildTermOptions(Object.keys(schedule), terms);
  const initialTerm = pickInitialTerm(termOptions, schedule, requested);
  if (!termOptions.some((o) => o.code === initialTerm)) {
    termOptions.unshift({ code: initialTerm, label: termLabel(initialTerm), viewOnly: false });
  }
  const trackedCounts: Record<string, number> = {};
  for (const watch of watches) trackedCounts[watch.term] = (trackedCounts[watch.term] ?? 0) + 1;
  // Meeting times for every scheduled class (the shown term first), so the calendar arrives
  // complete instead of resolving in a client waterfall on every visit.
  const resolved = await resolveScheduleSections(schedule, [initialTerm]);

  return (
    <SchedulePlanner
      initialSchedule={schedule}
      termOptions={termOptions}
      initialTerm={initialTerm}
      trackedCounts={trackedCounts}
      termsUnavailable={terms === null}
      resolved={resolved}
    />
  );
}

/**
 * Schedule builder (pages.md §6). Signed-in only (`requireUser()` redirects to `/`). The
 * server loads every term's schedule, the term list, tracked counts and the live meeting times
 * (one GoSolar search per course, 4 at a time); the client planner owns all interaction.
 */
export default function ScheduleBuilderPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SchedulePageSkeleton />}>
      <ScheduleBuilderData searchParams={searchParams} />
    </Suspense>
  );
}
