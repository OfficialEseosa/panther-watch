import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CourseSearchForm } from "@/components/courses/CourseSearchForm";
import formStyles from "@/components/courses/CourseSearchForm.module.css";
import { LoadingBar } from "@/components/courses/LoadingBar";
import { parseSearch, type RawSearchParams } from "@/components/courses/params";
import { RetryButton } from "@/components/courses/RetryButton";
import { SearchPageFrame } from "@/components/courses/SearchPageFrame";
import { ErrorMessage } from "@/components/courses/SectionParts";
import { isLevelPreference, type LevelPreference } from "@/lib/account/levels";
import { getCurrentUser } from "@/lib/auth/session";
import { getTerms, type TermInfo } from "@/lib/courses";
import { canonicalUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Search Georgia State classes",
  description:
    "Search Georgia State University (GSU) classes by term, subject and course number, with live seat counts, grade history and professor ratings.",
  alternates: { canonical: canonicalUrl("/course-search") },
};

type PageProps = { searchParams: Promise<RawSearchParams> };

/** Terms (request-time: they come from the database cache) and the account's campus, then the client form. */
async function SearchForm({ searchParams }: PageProps) {
  await connection();
  const [params, terms, accountLevel] = await Promise.all([searchParams, loadTerms(), loadAccountLevel()]);
  const prefill = parseSearch(params);
  const initial = prefill.term || prefill.subjects.length
    ? {
        term: prefill.term,
        subjects: prefill.subjects,
        courseNumber: prefill.courseNumber,
        ...(prefill.term ? { level: prefill.level } : {}),
      }
    : undefined;
  return (
    <>
      {terms ? null : (
        <ErrorMessage role="status" className={formStyles.notice} action={<RetryButton variant="secondary" />}>
          Couldn&rsquo;t load the term list. You can still search by typing a term code.
        </ErrorMessage>
      )}
      <CourseSearchForm
        // The router keeps this page's client state across visits (Back restores what was typed),
        // so a different prefill ("New search" from other results) must start a fresh form.
        key={JSON.stringify(initial ?? null)}
        terms={terms}
        initial={initial}
        accountLevel={accountLevel}
      />
    </>
  );
}

async function loadTerms(): Promise<TermInfo[] | null> {
  try {
    return await getTerms();
  } catch (error) {
    unstable_rethrow(error);
    console.warn("course search: could not load terms", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The signed-in user's saved campus (Settings > Campus); null for guests, when unset, or on failure. */
async function loadAccountLevel(): Promise<LevelPreference | null> {
  try {
    const user = await getCurrentUser();
    return isLevelPreference(user?.levelPreference) ? user.levelPreference : null;
  } catch (error) {
    unstable_rethrow(error);
    console.warn("course search: could not load the campus preference", error instanceof Error ? error.message : error);
    return null;
  }
}

export default function CourseSearchPage({ searchParams }: PageProps) {
  return (
    <SearchPageFrame>
      <Suspense fallback={<LoadingBar message="Loading terms..." />}>
        <SearchForm searchParams={searchParams} />
      </Suspense>
    </SearchPageFrame>
  );
}
