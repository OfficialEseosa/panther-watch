import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CourseResults, ResultsUnavailable } from "@/components/courses/CourseResults";
import { metaItemOf, type Section } from "@/components/courses/format";
import pageStyles from "@/components/courses/page.module.css";
import {
  courseNumbersOf,
  parseDialog,
  parseFilters,
  parseSearch,
  resultsHref,
  resultsTitle,
  searchFormHref,
  type RawSearchParams,
} from "@/components/courses/params";
import { ResultsSkeleton } from "@/components/courses/ResultsSkeleton";
import { ResultsToolbar } from "@/components/courses/ResultsToolbar";
import { ErrorMessage } from "@/components/courses/SectionParts";
import { loadViewer } from "@/components/shell/viewer.server";
import {
  getBatchMeta,
  getTerms,
  isUpstreamError,
  searchCourseList,
  type SectionMeta,
  type TermInfo,
} from "@/lib/courses";
import { listSchedule } from "@/lib/schedule";
import { listWatches } from "@/lib/watches";
import { courseCode, keyOf, sectionKey, termName as describeTerm } from "@/lib/format";

export const metadata: Metadata = {
  title: "Course results",
  description: "Live seat counts, grades and ratings for Georgia State sections.",
  // Every hit is a live GoSolar search; robots.ts also disallows it.
  robots: { index: false },
};

type PageProps = { searchParams: Promise<RawSearchParams> };

/** Cards that get server-fetched meta: the first page. Later pages batch-fetch on the client. */
const FIRST_PAGE = 12;
/** Enrichment never blocks the list for long (pages.md §4). */
const META_BUDGET_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function safe<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    unstable_rethrow(error);
    console.warn(`course results: ${label} failed`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function Results({ searchParams }: PageProps) {
  // Live seat counts, the session and the terms cache (which reads the clock) are request-time.
  await connection();
  const params = await searchParams;
  const search = parseSearch(params);

  if (!search.ok) {
    return (
      <div className={pageStyles.stack}>
        <ResultsToolbar title={search.reason === "empty" ? "Start with a search" : "This search link isn’t valid"} />
        <ErrorMessage role="status">{search.message}</ErrorMessage>
      </div>
    );
  }

  const { term, subjects, courseNumber, level } = search;
  // Every subject x course number pair, concurrently (parseSearch caps the pairs).
  const [viewer, terms, found] = await Promise.all([
    loadViewer(),
    safe<TermInfo[]>("terms", () => getTerms()),
    // Never rejects for GoSolar failures: those come back per pair in `failed`.
    searchCourseList({ term, subjects, courseNumbers: courseNumbersOf(courseNumber), level: level ?? undefined }),
  ]);

  const failedSearches: string[] = [];
  for (const failure of found.failed) {
    unstable_rethrow(failure.error);
    const label = failure.courseNumber ? courseCode(failure.subject, failure.courseNumber) : failure.subject;
    failedSearches.push(label);
    console.error(
      `course results: ${isUpstreamError(failure.error) ? "GoSolar" : "search"} failed for ${term} ${label}`,
      failure.error instanceof Error ? failure.error.message : failure.error,
    );
  }
  // Merged, deduplicated by (term, CRN) and sorted once by the lib: the client keeps this
  // order for its default (course) sort.
  const sections = found.sections as Section[];
  const pairCount = subjects.length * Math.max(1, courseNumbersOf(courseNumber).length);

  const termInfo = terms?.find((t) => t.code === term);
  const name = describeTerm(term, termInfo?.description ?? sections.find((s) => s.termDesc)?.termDesc);

  if (failedSearches.length === pairCount) {
    return (
      <ResultsUnavailable
        title={resultsTitle({ subjects, courseNumber, level }, name)}
        editHref={searchFormHref({ term, subjects, courseNumber, level })}
      />
    );
  }

  // First-page meta (server-side, one batch, capped) plus the viewer's watches and schedule.
  const firstPage = sections.slice(0, FIRST_PAGE).flatMap((section) => {
    const item = metaItemOf(section);
    return item ? [{ section, item }] : [];
  });
  const user = viewer.user;
  const [metaList, watches, schedule] = await Promise.all([
    firstPage.length
      ? withTimeout<SectionMeta[] | null>(
          getBatchMeta(firstPage.map((entry) => entry.item)),
          META_BUDGET_MS,
          null,
        )
      : Promise.resolve(null),
    user ? safe("watches", () => listWatches(user.id)) : Promise.resolve(null),
    user ? safe("schedule", () => listSchedule(user.id)) : Promise.resolve(null),
  ]);

  const initialMeta: Record<string, SectionMeta> = {};
  metaList?.forEach((meta, index) => {
    const entry = firstPage[index];
    if (entry) initialMeta[keyOf(entry.section)] = meta;
  });

  // Keyed by the search: a new search is a new results view, so the filter, page and
  // optimistic toggle state start fresh.
  return (
    <CourseResults
      key={resultsHref(search)}
      search={{ term, subjects, courseNumber, level }}
      termName={name}
      viewOnly={termInfo?.viewOnly ?? false}
      sections={sections}
      failedSearches={failedSearches}
      initialMeta={initialMeta}
      watched={(watches ?? []).map((w) => sectionKey(w.term, w.crn))}
      scheduled={Object.values(schedule ?? {}).flatMap((entries) => entries.map((e) => sectionKey(e.term, e.crn)))}
      isSignedIn={Boolean(user)}
      initialFilters={parseFilters(params)}
      initialDialog={parseDialog(params)}
    />
  );
}

export default function CourseResultsPage({ searchParams }: PageProps) {
  return (
    <div className={pageStyles.default}>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
