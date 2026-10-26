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
        <ErrorMessage role="status" className={formStyles.notice} action={<RetryButton variant="secondary" />}>
          Couldn&rsquo;t load the term list. You can still search by typing a term code.
        </ErrorMessage>
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
    <SearchPageFrame>
      <Suspense fallback={<LoadingBar message="Loading terms..." />}>
        <SearchForm searchParams={searchParams} />
      </Suspense>
    </SearchPageFrame>
  );
}
