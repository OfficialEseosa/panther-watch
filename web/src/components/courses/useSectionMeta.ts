"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBatchMeta, META_BATCH_MAX, type MetaItem, type SectionMeta } from "@/lib/client/courses";
import { isAbortError } from "@/lib/client/http";
import { keyOf } from "@/lib/format";
import type { CourseData } from "@/lib/gosolar/types";
import { metaItemOf } from "./format";

export type MetaMap = Readonly<Record<string, SectionMeta>>;

type InFlight = { controller: AbortController; keys: string[] };

const NONE: ReadonlySet<string> = new Set();

/**
 * The shared grades/rating/syllabus map for a page, keyed by (term, crn). Seeded with what the
 * server fetched; `ensure(sections)` batch-fetches only keys never requested before (one POST
 * per 50), so paging back and forth never refetches. Cards and the detail dialog both read
 * this map, so meta that arrives after the dialog opened shows up in it (audit bug #5).
 *
 * A batch that fails marks its keys in `failed` (so the dialog shows an error instead of a
 * skeleton forever) and forgets them, so `retry(sections)` (or a later `ensure`) asks again.
 */
export function useSectionMeta(initial: MetaMap) {
  const [meta, setMeta] = useState<MetaMap>(initial);
  const [failed, setFailed] = useState<ReadonlySet<string>>(NONE);
  const requested = useRef(new Set(Object.keys(initial)));
  const inFlight = useRef(new Set<InFlight>());

  useEffect(() => {
    const pending = inFlight.current;
    const asked = requested.current;
    return () => {
      // Unmount (or StrictMode's simulated one): cancel and forget, so a remount asks again.
      for (const entry of pending) {
        entry.controller.abort();
        for (const key of entry.keys) asked.delete(key);
      }
      pending.clear();
    };
  }, []);

  const ensure = useCallback((sections: readonly CourseData[]) => {
    const wanted: Array<{ key: string; item: MetaItem }> = [];
    for (const section of sections) {
      const key = keyOf(section);
      if (requested.current.has(key)) continue;
      const item = metaItemOf(section);
      requested.current.add(key);
      if (item) wanted.push({ key, item });
    }
    if (wanted.length === 0) return;
    const keys = new Set(wanted.map((w) => w.key));
    setFailed((prev) => {
      if (![...keys].some((key) => prev.has(key))) return prev;
      const next = new Set(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
    for (let i = 0; i < wanted.length; i += META_BATCH_MAX) {
      const chunk = wanted.slice(i, i + META_BATCH_MAX);
      const entry: InFlight = { controller: new AbortController(), keys: chunk.map((c) => c.key) };
      inFlight.current.add(entry);
      fetchBatchMeta(
        chunk.map((c) => c.item),
        entry.controller.signal,
      )
        .then(({ items }) => {
          setMeta((prev) => {
            const next: Record<string, SectionMeta> = { ...prev };
            chunk.forEach((c, index) => {
              const value = items[index];
              if (value) next[c.key] = value;
            });
            return next;
          });
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) return;
          console.warn("course meta batch failed", error instanceof Error ? error.message : error);
          for (const key of entry.keys) requested.current.delete(key);
          setFailed((prev) => new Set([...prev, ...entry.keys]));
        })
        .finally(() => {
          inFlight.current.delete(entry);
        });
    }
  }, []);

  /** Asks again for sections whose batch failed. */
  const retry = useCallback((sections: readonly CourseData[]) => ensure(sections), [ensure]);

  return { meta, failed, ensure, retry };
}
