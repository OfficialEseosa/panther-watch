import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CourseSearchForm, RecentSearches } from "@/components/courses/CourseSearchForm";
import pageStyles from "@/components/courses/page.module.css";
import { parseSearch, type RawSearchParams } from "@/components/courses/params";
import { RetryButton } from "@/components/courses/RetryButton";
import { SearchFormSkeleton } from "@/components/courses/SearchFormSkeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { getTerms, type TermInfo } from "@/lib/courses";

export const metadata: Metadata = {
  title: "Search classes",
  description: "Search Georgia State sections by term, subject and course number, with live seat counts.",
};

type PageProps = { searchParams: Promise<RawSearchParams> };

/** Terms (request-time: they come from the database cache), then the client form. */
async function SearchForm({ searchParams }: PageProps) {
  await connection();
  const [params, terms] = await Promise.all([searchParams, loadTerms()]);
  const prefill = parseSearch(params);
  return (
    <>
      {terms ? null : (
        <Banner
          tone="warning"
          className={pageStyles.bannerGap}
          title="Couldn't load the term list."
          action={<RetryButton size="sm" variant="secondary">Retry</RetryButton>}
        >
          You can still search by typing a term code.
        </Banner>
      )}
      <CourseSearchForm
        terms={terms}
        initial={
          prefill.term || prefill.subjects.length
            ? {
                term: prefill.term,
                subjects: prefill.subjects,
                courseNumber: prefill.courseNumber,
                ...(prefill.term ? { level: prefill.level } : {}),
              }
            : undefined
        }
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

export default function CourseSearchPage({ searchParams }: PageProps) {
  return (
    <div className={pageStyles.narrow}>
      <PageHeader title="Search classes" description="Live seat counts for Georgia State sections." />
      <Card>
        <Suspense fallback={<SearchFormSkeleton />}>
          <SearchForm searchParams={searchParams} />
        </Suspense>
      </Card>
      <RecentSearches />
    </div>
  );
}
