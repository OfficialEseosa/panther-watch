"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchSections } from "@/lib/client/courses";
import { isAbortError } from "@/lib/client/http";
import type { ScheduleEntry } from "@/lib/client/schedule";
import { sectionKey } from "@/lib/format";
import type { CourseData } from "@/lib/gosolar/types";
import { courseKey, type ResolvedSchedule } from "./resolve";

/**
 * Live GoSolar sections for the schedule entries. The page resolves the whole schedule on the
 * server (`resolve.server.ts`) and passes the result as `initial`; this hook only searches
 * what that didn't cover: classes added during the session without a section in hand (the
 * tracked tab when GoSolar was down), courses the server ran out of time for, and Retry after a
 * failed search. Each course is searched once (at most 4 in flight); switching terms aborts
 * the old term's searches. Sections already in hand (just added) can be seeded.
 *
 * New server data (an `initial` with a new identity, e.g. a navigation to `?term=`) is merged in.
 */

export type ResolveStatus = "loading" | "ok" | "missing" | "failed";

export interface Resolution {
  status: ResolveStatus;
  section: CourseData | null;
}

const CONCURRENCY = 4;

interface Runner {
  term: string;
  controller: AbortController;
  queue: Array<{ key: string; subject: string; courseNumber: string }>;
  inflight: Set<string>;
  active: number;
}

export function useSectionResolver(term: string | null, entries: readonly ScheduleEntry[], initial: ResolvedSchedule) {
  /** `term|crn` -> section, from the server, client searches and seeds. */
  const [known, setKnown] = useState<Record<string, CourseData>>(initial.sections);
  /** Course key -> outcome of its search ("ok" = done; CRNs not found are "missing"). */
  const [fetched, setFetched] = useState<Record<string, "ok" | "error">>(initial.outcomes);
  const [source, setSource] = useState(initial);
  const runnerRef = useRef<Runner | null>(null);

  // Fresh server resolution: merge it in (adjusting state during render).
  if (source !== initial) {
    setSource(initial);
    setKnown((prev) => ({ ...prev, ...initial.sections }));
    setFetched((prev) => ({ ...prev, ...initial.outcomes }));
  }

  const resolutions = useMemo(() => {
    const map = new Map<string, Resolution>();
    for (const entry of entries) {
      const section = known[sectionKey(entry.term, entry.crn)];
      if (section) {
        map.set(entry.crn, { status: "ok", section });
        continue;
      }
      const outcome = fetched[courseKey(entry.term, entry.subject, entry.courseNumber)];
      map.set(entry.crn, {
        status: outcome === "ok" ? "missing" : outcome === "error" ? "failed" : "loading",
        section: null,
      });
    }
    return map;
  }, [entries, known, fetched]);

  /** Courses that still need a search, as a stable string for the effect below. */
  const pending = useMemo(() => {
    const keys = new Map<string, { key: string; subject: string; courseNumber: string }>();
    for (const entry of entries) {
      if (known[sectionKey(entry.term, entry.crn)]) continue;
      const key = courseKey(entry.term, entry.subject, entry.courseNumber);
      if (fetched[key]) continue;
      keys.set(key, { key, subject: entry.subject, courseNumber: entry.courseNumber });
    }
    return [...keys.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [entries, known, fetched]);
  const pendingSignature = pending.map((item) => item.key).join(",");

  // One runner per term: changing term (or unmounting) aborts everything in flight for it.
  useEffect(() => {
    if (!term) return;
    const runner: Runner = { term, controller: new AbortController(), queue: [], inflight: new Set(), active: 0 };
    runnerRef.current = runner;
    return () => {
      runner.controller.abort();
      runner.queue.length = 0;
      if (runnerRef.current === runner) runnerRef.current = null;
    };
  }, [term]);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner || runner.term !== term || pending.length === 0) return;

    const pump = () => {
      while (runner.active < CONCURRENCY && runner.queue.length > 0 && !runner.controller.signal.aborted) {
        const job = runner.queue.shift()!;
        runner.active += 1;
        searchSections({ term: runner.term, subject: job.subject, courseNumber: job.courseNumber }, runner.controller.signal)
          .then((sections) => {
            if (runner.controller.signal.aborted) return;
            setKnown((prev) => {
              const next = { ...prev };
              for (const section of sections) {
                if (section.courseReferenceNumber) next[sectionKey(runner.term, section.courseReferenceNumber)] = section;
              }
              return next;
            });
            setFetched((prev) => ({ ...prev, [job.key]: "ok" }));
          })
          .catch((error: unknown) => {
            if (isAbortError(error) || runner.controller.signal.aborted) return;
            setFetched((prev) => ({ ...prev, [job.key]: "error" }));
          })
          .finally(() => {
            runner.active -= 1;
            runner.inflight.delete(job.key);
            pump();
          });
      }
    };

    for (const job of pending) {
      if (runner.inflight.has(job.key)) continue;
      runner.inflight.add(job.key);
      runner.queue.push(job);
    }
    pump();
    // `pending` is fully described by its signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, pendingSignature]);

  /** Adds sections already in hand (from the Add classes dialog) so they never refetch. */
  const seed = useCallback((seedTerm: string, sections: readonly CourseData[]) => {
    setKnown((prev) => {
      let next: Record<string, CourseData> | null = null;
      for (const section of sections) {
        if (!section.courseReferenceNumber) continue;
        next ??= { ...prev };
        next[sectionKey(seedTerm, section.courseReferenceNumber)] = section;
      }
      return next ?? prev;
    });
  }, []);

  /** Clears failed searches for `retryTerm`, so the effect searches them again. */
  const retryFailed = useCallback((retryTerm: string) => {
    setFetched((prev) => {
      const next: Record<string, "ok" | "error"> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value === "error" && key.startsWith(`${retryTerm}|`)) continue;
        next[key] = value;
      }
      return next;
    });
  }, []);

  return { resolutions, seed, retryFailed };
}
