import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import pageStyles from "@/components/courses/page.module.css";
import { parseDialog, type RawSearchParams } from "@/components/courses/params";
import { TrackedClasses, TrackedUnavailable } from "@/components/tracked/TrackedClasses";
import { expiryNotice } from "@/components/tracked/expiry";
import { TrackedSkeleton } from "@/components/tracked/TrackedSkeleton";
import { requireUser } from "@/lib/auth/session";
import { getTerms } from "@/lib/courses";
import { listSchedule } from "@/lib/schedule";
import { listWatchesWithDetails } from "@/lib/watches";
import { sectionKey, termName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Tracked classes",
  description: "The sections you watch, with live seat counts. We email you when a seat opens.",
};

/** Up to 35 s on a cold GoSolar (20 s details deadline plus DB and render). */
export const maxDuration = 40;

type PageProps = { searchParams: Promise<RawSearchParams> };

async function safe<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    unstable_rethrow(error);
    console.warn(`tracked classes: ${label} failed`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function Tracked({ searchParams }: PageProps) {
  await connection();
  let loaded;
  try {
    const user = await requireUser();
    loaded = await Promise.all([
      searchParams,
      listWatchesWithDetails(user.id),
      safe("terms", () => getTerms()),
      safe("schedule", () => listSchedule(user.id)),
    ]);
  } catch (error) {
    // redirect() from requireUser and other Next.js control flow pass through.
    unstable_rethrow(error);
    console.error("tracked classes: could not load watches", error instanceof Error ? error.message : error);
    return <TrackedUnavailable />;
  }
  const [params, details, terms, schedule] = loaded;

  const termNames: Record<string, string> = {};
  for (const item of details.items) {
    const code = item.watch.term;
    if (termNames[code]) continue;
    const info = terms?.find((t) => t.code === code);
    termNames[code] = termName(code, info?.description ?? item.section?.termDesc);
  }
  // Request-time (after connection()), so the client never reads the clock while rendering.
  const now = new Date();
  const expiryNotices: Record<string, string> = {};
  for (const code of Object.keys(termNames)) {
    const notice = expiryNotice(code, now);
    if (notice) expiryNotices[code] = notice;
  }

  return (
    <TrackedClasses
      items={details.items}
      termNames={termNames}
      scheduled={Object.values(schedule ?? {}).flatMap((entries) => entries.map((e) => sectionKey(e.term, e.crn)))}
      viewOnlyTerms={(terms ?? []).filter((t) => t.viewOnly).map((t) => t.code)}
      initialDialog={parseDialog(params)}
      expiryNotices={expiryNotices}
    />
  );
}

export default function TrackedClassesPage({ searchParams }: PageProps) {
  return (
    <div className={pageStyles.default}>
      <Suspense fallback={<TrackedSkeleton />}>
        <Tracked searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
