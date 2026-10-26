"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useToast, type ToastApi } from "@/components/ui/Toast";
import { addWatch, removeWatch, type CourseData } from "@/lib/client/courses";
import { ApiError, isAbortError, onUnauthorized } from "@/lib/client/http";
import { addScheduleEntry, removeScheduleEntry } from "@/lib/client/schedule";
import { courseCode, instructorOf, keyOf } from "@/lib/format";
import { sectionLabel, titleOf } from "./format";

/** Toast for a guest trying a member action. */
export function promptSignIn(toast: Pick<ToastApi, "info">, title = "Sign in to track classes") {
  onUnauthorized(toast, { title, body: "Watching sections and building a schedule need a free account." });
}

/**
 * Maps an API failure to a toast; never throws. A 401 gets the shared sign-in toast; any other
 * answer from the server shows the server's own message (4xx messages say what was wrong, e.g.
 * "Registration for Fall 2026 is closed"); only a request that got no answer says to check the
 * connection.
 */
export function reportActionError(toast: Pick<ToastApi, "info" | "error">, error: unknown, fallback: string) {
  if (isAbortError(error)) return;
  if (error instanceof ApiError) {
    if (error.status === 401) {
      onUnauthorized(toast);
      return;
    }
    toast.error(fallback, { body: error.message });
    return;
  }
  toast.error(fallback, { body: "Check your connection and try again." });
}

const watchInput = (section: CourseData, term: string, crn: string) => ({
  term,
  crn,
  subject: section.subject ?? "",
  courseNumber: section.courseNumber ?? "",
  courseTitle: titleOf(section),
  instructor: instructorOf(section),
});

const scheduleInput = (section: CourseData, term: string, crn: string) => ({
  term,
  crn,
  subject: section.subject ?? "",
  courseNumber: section.courseNumber ?? "",
  courseTitle: titleOf(section),
});

type SetState = ReadonlySet<string>;

function toggled(set: SetState, key: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

export type SectionActions = ReturnType<typeof useSectionActions>;

/**
 * Watch and schedule state for a page of sections, keyed by (term, crn) (audit bug #9).
 * Toggles are optimistic: the state flips at once, the request runs, and a failure rolls back
 * with an error toast. Guests get a sign-in toast instead. Removals offer Undo, which takes the
 * same per-section busy flag as a toggle, so Undo and a toggle can never race.
 *
 * New server data (`initialWatched` / `initialScheduled` with a new identity, e.g. after
 * `router.refresh()`) replaces the local sets. Pass memoized arrays.
 */
export function useSectionActions({
  initialWatched,
  initialScheduled,
  isSignedIn,
}: {
  initialWatched: readonly string[];
  initialScheduled: readonly string[];
  isSignedIn: boolean;
}) {
  const toast = useToast();
  const [watched, setWatchedState] = useState<SetState>(() => new Set(initialWatched));
  const [scheduled, setScheduledState] = useState<SetState>(() => new Set(initialScheduled));
  const [pending, setPending] = useState<SetState>(() => new Set());
  const [sources, setSources] = useState({ watched: initialWatched, scheduled: initialScheduled });
  // Mirrors for handlers that run later (Undo) and must see the latest state.
  const watchedRef = useRef(watched);
  const scheduledRef = useRef(scheduled);
  const pendingRef = useRef(pending);

  // Fresh server data: adopt it (adjusting state during render).
  if (sources.watched !== initialWatched || sources.scheduled !== initialScheduled) {
    setSources({ watched: initialWatched, scheduled: initialScheduled });
    if (sources.watched !== initialWatched) setWatchedState(new Set(initialWatched));
    if (sources.scheduled !== initialScheduled) setScheduledState(new Set(initialScheduled));
  }
  // Keep the mirrors in step with what is rendered (including adopted server data).
  useLayoutEffect(() => {
    watchedRef.current = watched;
    scheduledRef.current = scheduled;
  }, [watched, scheduled]);

  const setWatched = useCallback((key: string, on: boolean) => {
    watchedRef.current = toggled(watchedRef.current, key, on);
    setWatchedState(watchedRef.current);
  }, []);
  const setScheduled = useCallback((key: string, on: boolean) => {
    scheduledRef.current = toggled(scheduledRef.current, key, on);
    setScheduledState(scheduledRef.current);
  }, []);
  /** Takes the busy flag; false when it was already taken. */
  const claim = useCallback((busyKey: string): boolean => {
    if (pendingRef.current.has(busyKey)) return false;
    pendingRef.current = toggled(pendingRef.current, busyKey, true);
    setPending(pendingRef.current);
    return true;
  }, []);
  const release = useCallback((busyKey: string) => {
    pendingRef.current = toggled(pendingRef.current, busyKey, false);
    setPending(pendingRef.current);
  }, []);

  const toggleWatch = useCallback(
    async (section: CourseData): Promise<boolean> => {
      if (!isSignedIn) {
        promptSignIn(toast);
        return false;
      }
      const key = keyOf(section);
      const busyKey = `watch:${key}`;
      const term = section.term;
      const crn = section.courseReferenceNumber;
      if (!term || !crn || !claim(busyKey)) return false;
      const wasOn = watchedRef.current.has(key);
      setWatched(key, !wasOn);
      try {
        if (wasOn) {
          await removeWatch(term, crn);
          toast.success(`Stopped watching ${sectionLabel(section)}`, {
            action: {
              label: "Undo",
              onClick: () => {
                if (watchedRef.current.has(key) || !claim(busyKey)) return;
                setWatched(key, true);
                addWatch(watchInput(section, term, crn))
                  .then(() => toast.success(`Watching ${sectionLabel(section)} again`))
                  .catch((error: unknown) => {
                    setWatched(key, false);
                    reportActionError(toast, error, "Couldn't watch this section again");
                  })
                  .finally(() => release(busyKey));
              },
            },
          });
        } else {
          await addWatch(watchInput(section, term, crn));
          toast.success(`Watching ${sectionLabel(section)}`, { body: "We'll email you when a seat opens." });
        }
        return true;
      } catch (error) {
        setWatched(key, wasOn);
        reportActionError(toast, error, wasOn ? "Couldn't stop watching this section" : "Couldn't watch this section");
        return false;
      } finally {
        release(busyKey);
      }
    },
    [isSignedIn, toast, setWatched, claim, release],
  );

  const toggleSchedule = useCallback(
    async (section: CourseData): Promise<boolean> => {
      if (!isSignedIn) {
        promptSignIn(toast, "Sign in to build a schedule");
        return false;
      }
      const key = keyOf(section);
      const busyKey = `schedule:${key}`;
      const term = section.term;
      const crn = section.courseReferenceNumber;
      if (!term || !crn || !claim(busyKey)) return false;
      const wasOn = scheduledRef.current.has(key);
      setScheduled(key, !wasOn);
      try {
        if (wasOn) {
          await removeScheduleEntry(term, crn);
          toast.success(`Removed ${courseCode(section)} from your schedule`, {
            action: {
              label: "Undo",
              onClick: () => {
                if (scheduledRef.current.has(key) || !claim(busyKey)) return;
                setScheduled(key, true);
                addScheduleEntry(scheduleInput(section, term, crn))
                  .then(() => toast.success(`Added ${sectionLabel(section)} back to your schedule`))
                  .catch((error: unknown) => {
                    setScheduled(key, false);
                    reportActionError(toast, error, "Couldn't add this class back");
                  })
                  .finally(() => release(busyKey));
              },
            },
          });
        } else {
          await addScheduleEntry(scheduleInput(section, term, crn));
          toast.success(`Added ${sectionLabel(section)} to your schedule`);
        }
        return true;
      } catch (error) {
        setScheduled(key, wasOn);
        reportActionError(toast, error, wasOn ? "Couldn't remove this class" : "Couldn't add this class");
        return false;
      } finally {
        release(busyKey);
      }
    },
    [isSignedIn, toast, setScheduled, claim, release],
  );

  return {
    isSignedIn,
    isWatched: (section: CourseData) => watched.has(keyOf(section)),
    isScheduled: (section: CourseData) => scheduled.has(keyOf(section)),
    isWatchPending: (section: CourseData) => pending.has(`watch:${keyOf(section)}`),
    isSchedulePending: (section: CourseData) => pending.has(`schedule:${keyOf(section)}`),
    toggleWatch,
    toggleSchedule,
  };
}
