/**
 * Typed wrappers for the course, meta and watch route handlers (fetching is `./http`).
 * Client-safe: only type imports from server modules. Every call takes an optional AbortSignal.
 */
import type { SectionMeta } from "@/lib/courses/meta";
import type { TermInfo } from "@/lib/courses/terms";
import type { CourseData, Subject } from "@/lib/gosolar/types";
import type { Watch, WatchDetailsItem } from "@/lib/watches";
import { del, getJson, postJson, query } from "./http";

export type { CourseData, SectionMeta, Subject, TermInfo, Watch, WatchDetailsItem };

// ---------------------------------------------------------------- courses

export async function fetchSubjects(term: string, q: string, signal?: AbortSignal): Promise<Subject[]> {
  return (await getJson<{ subjects: Subject[] }>(`/api/courses/subjects?${query({ term, q })}`, signal)).subjects;
}

export type SearchInput = { term: string; subject: string; courseNumber?: string | null; level?: string | null };

/** Live GoSolar sections for one subject (optionally one course number). */
export async function searchSections(input: SearchInput, signal?: AbortSignal): Promise<CourseData[]> {
  return (await getJson<{ sections: CourseData[] }>(`/api/courses/search?${query(input)}`, signal)).sections;
}

export type MetaItem = { term: string; subject: string; courseNumber: string; crn: string; instructor?: string | null };

/** Max items per batch request (the route's BATCH_META_MAX). */
export const META_BATCH_MAX = 50;

export function fetchBatchMeta(items: MetaItem[], signal?: AbortSignal) {
  return postJson<{ items: SectionMeta[] }>("/api/courses/meta/batch", { items }, signal);
}

// ---------------------------------------------------------------- watches

export type WatchInput = {
  term: string;
  crn: string;
  subject: string;
  courseNumber: string;
  courseTitle?: string | null;
  instructor?: string | null;
};

/** `openNow`: the section had open seats when tracked, so the first alert comes after it fills and reopens. */
export function addWatch(input: WatchInput, signal?: AbortSignal) {
  return postJson<{ watch: Watch; created: boolean; openNow: boolean }>("/api/watches", input, signal);
}

export function removeWatch(term: string, crn: string, signal?: AbortSignal) {
  return del<{ removed: boolean }>(`/api/watches?${query({ term, crn })}`, signal);
}

/** Every watch with its live section (null when GoSolar didn't answer or no longer lists it). */
export async function fetchWatchDetails(signal?: AbortSignal): Promise<WatchDetailsItem[]> {
  return (await getJson<{ items: WatchDetailsItem[] }>("/api/watches/details", signal)).items;
}
