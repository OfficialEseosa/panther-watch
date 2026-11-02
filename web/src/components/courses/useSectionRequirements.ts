"use client";

import { useEffect, useState } from "react";
import { fetchSectionRequirements, type SectionRequirements } from "@/lib/client/courses";
import { sectionKey } from "@/lib/format";

/**
 * Requirements already loaded this page session, keyed by (term, crn), and the requests still
 * in flight (shared, so StrictMode's double effect and a quick tab switch ask GoSolar once).
 * Failures are never cached: Retry, or opening the tab again, asks again.
 */
const loaded = new Map<string, SectionRequirements>();
const pending = new Map<string, Promise<SectionRequirements>>();

function load(term: string, crn: string, key: string): Promise<SectionRequirements> {
  let request = pending.get(key);
  if (!request) {
    request = fetchSectionRequirements(term, crn)
      .then((requirements) => {
        loaded.set(key, requirements);
        return requirements;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

export type RequirementsState =
  | { status: "loading" }
  | { status: "failed"; retry: () => void }
  | { status: "ready"; requirements: SectionRequirements };

type Settled = { key: string; attempt: number; requirements?: SectionRequirements; failed?: boolean };

/**
 * A section's prerequisites, corequisites, restrictions and description, fetched when the
 * dialog's Requirements tab first renders (lazy) and cached per (term, crn) for the session.
 */
export function useSectionRequirements(term: string, crn: string): RequirementsState {
  const key = sectionKey(term, crn);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const cached = loaded.get(key);

  useEffect(() => {
    if (loaded.has(key)) return;
    let active = true;
    load(term, crn, key).then(
      (requirements) => {
        if (active) setSettled({ key, attempt, requirements });
      },
      (error: unknown) => {
        if (!active) return;
        console.warn("course requirements failed", error instanceof Error ? error.message : error);
        setSettled({ key, attempt, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [term, crn, key, attempt]);

  if (cached) return { status: "ready", requirements: cached };
  if (settled && settled.key === key && settled.attempt === attempt) {
    if (settled.requirements) return { status: "ready", requirements: settled.requirements };
    if (settled.failed) return { status: "failed", retry: () => setAttempt((n) => n + 1) };
  }
  return { status: "loading" };
}
