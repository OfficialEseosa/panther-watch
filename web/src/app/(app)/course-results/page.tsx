import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CourseResults, ResultsUnavailable } from "@/components/courses/CourseResults";
import { metaItemOf, type Section } from "@/components/courses/format";
import pageStyles from "@/components/courses/page.module.css";
import { parseDialog, parseFilters, parseSearch, resultsHref, type RawSearchParams } from "@/components/courses/params";
import { ResultsSkeleton } from "@/components/courses/ResultsSkeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { loadViewer } from "@/components/shell/viewer.server";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchIcon } from "@/components/ui/icons";
import { getBatchMeta, getTerms, isUpstreamError, searchSections, type SectionMeta, type TermInfo } from "@/lib/courses";
import { listSchedule } from "@/lib/schedule";
import { listWatches } from "@/lib/watches";
import { compareSections, keyOf, sectionKey, termName as describeTerm } from "@/lib/format";

export const metadata: Metadata = {
  title: "Course results",
  description: "Live seat counts, grades and ratings for Georgia State sections.",
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
      <>
        <PageHeader title="Course results" />
        <EmptyState
          variant="first-use"
          icon={<SearchIcon size={24} />}
          title={search.reason === "empty" ? "Start with a search" : "This search link isn’t valid"}
          actions={
            <ButtonLink href="/course-search" leadingIcon={<SearchIcon />}>
              Search classes
            </ButtonLink>
          }
        >
          {search.message}
        </EmptyState>
      </>
    );
  }

  const { term, subjects, courseNumber, level } = search;
  const [viewer, terms, settled] = await Promise.all([
    loadViewer(),
    safe<TermInfo[]>("terms", () => getTerms()),
    Promise.allSettled(
      subjects.map((subject) =>
        searchSections({ term, subject, courseNumber: courseNumber ?? undefined, level: level ?? undefined }),
      ),
    ),
  ]);

  const failedSubjects: string[] = [];
  const seen = new Set<string>();
  const sections: Section[] = [];
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      unstable_rethrow(result.reason);
      failedSubjects.push(subjects[index]);
      console.error(
        `course results: ${isUpstreamError(result.reason) ? "GoSolar" : "search"} failed for ${term} ${subjects[index]}`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
      return;
    }
    for (const section of result.value as Section[]) {
      const key = keyOf(section);
      if (seen.has(key)) continue;
      seen.add(key);
      sections.push(section);
    }
  });
  // Sorted once, here: the client keeps this order for its default (course) sort.
  sections.sort(compareSections);

  const editHref = `/course-search?${new URLSearchParams({ term, subjects: subjects.join(",") }).toString()}`;
  const termInfo = terms?.find((t) => t.code === term);
  const name = describeTerm(term, termInfo?.description ?? sections.find((s) => s.termDesc)?.termDesc);

  if (failedSubjects.length === subjects.length) {
    return (
      <>
        <PageHeader title={`${subjects.join(", ")}${courseNumber ? ` ${courseNumber}` : ""} · ${name}`} />
        <ResultsUnavailable editHref={editHref} />
      </>
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

  // Keyed by the search: a new search (inline Edit search, a Recent search chip) is a new
  // results view, so filters, page, the edit form and optimistic toggle state start fresh.
  return (
    <CourseResults
      key={resultsHref(search)}
      search={{ term, subjects, courseNumber, level }}
      termName={name}
      viewOnly={termInfo?.viewOnly ?? false}
      terms={terms}
      sections={sections}
      failedSubjects={failedSubjects}
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
