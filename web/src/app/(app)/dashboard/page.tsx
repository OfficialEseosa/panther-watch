import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FeatureCards, FeatureCardsSkeleton } from "@/components/dashboard/FeatureCards";
import { loadDashboardSummary } from "@/components/dashboard/summary.server";
import { WhatsNewLauncher } from "@/components/dashboard/WhatsNewLauncher";
import { SIGN_IN_HREF } from "@/components/shell/nav";
import { Banner } from "@/components/ui/Banner";
import { ButtonAnchor } from "@/components/ui/Button";
import { BookmarkIcon, LockIcon } from "@/components/ui/icons";
import { firstName } from "@/lib/format";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import layout from "@/components/dashboard/Dashboard.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard" };

const SUBTITLE = "Keep an eye on enrollment and act quickly when seats open across Georgia State courses.";

/**
 * /dashboard: the original dashboard (old Dashboard.jsx): a guest notice for guests, the
 * greeting card with the tracked-classes count, and the three feature cards, plus the one-time
 * "What's new" showcase. The page is static; everything that depends on the visitor streams in
 * behind <Suspense>. Database only: no GoSolar calls here.
 */
export default function DashboardPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

async function Dashboard() {
  let user: CurrentUser | null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    unstable_rethrow(error);
    console.error("dashboard: could not load the current user", error instanceof Error ? error.name : typeof error);
    return <AccountUnavailable />;
  }
  if (!user) return <GuestDashboard />;
  return <MemberDashboard userId={user.id} name={firstName(user.name) ?? "Panther"} />;
}

/** The greeting card (old .dashboard-header): eyebrow, title, subtitle, and an optional aside. */
function Greeting({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <section className={layout.header} aria-labelledby="dashboard-title">
      <div className={layout.headerCopy}>
        <span className={layout.eyebrow}>Overview</span>
        <h1 id="dashboard-title" className={layout.title}>
          {title}
        </h1>
        <p className={layout.subtitle}>{SUBTITLE}</p>
      </div>
      {aside}
    </section>
  );
}

function TrackedSummary({ count }: { count: number | null }) {
  return (
    <div className={layout.summary} aria-live="polite">
      <span className={layout.summaryIcon} aria-hidden="true">
        <BookmarkIcon size={26} />
      </span>
      <div className={layout.summaryContent}>
        <span className={layout.summaryLabel}>Tracked classes</span>{" "}
        <span className={layout.summaryValue}>{count ?? "…"}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

function MemberDashboard({ userId, name }: { userId: string; name: string }) {
  return (
    <div className={layout.dashboard}>
      <Suspense
        fallback={
          <>
            <Greeting title={`Welcome back, ${name}.`} aside={<TrackedSummary count={null} />} />
            <FeatureCardsSkeleton />
          </>
        }
      >
        <MemberSections userId={userId} name={name} />
      </Suspense>
      <WhatsNewLauncher member />
    </div>
  );
}

async function MemberSections({ userId, name }: { userId: string; name: string }) {
  let tracked: number;
  try {
    tracked = (await loadDashboardSummary(userId)).tracked;
  } catch (error) {
    unstable_rethrow(error);
    console.error("dashboard: could not load the summary", error instanceof Error ? error.name : typeof error);
    return (
      <>
        <Banner
          tone="danger"
          title="Couldn't load your classes."
          action={
            <ButtonAnchor href="/dashboard" size="sm" variant="secondary">
              Try again
            </ButtonAnchor>
          }
        >
          Your tracked classes and schedule are safe. This usually clears up in a moment.
        </Banner>
        <Greeting title={`Welcome back, ${name}.`} />
        <FeatureCards mode="member-unknown" />
      </>
    );
  }
  return (
    <>
      <Greeting title={`Welcome back, ${name}.`} aside={<TrackedSummary count={tracked} />} />
      <FeatureCards mode="member" tracked={tracked} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Guests and failures
// ---------------------------------------------------------------------------------------------

function GuestDashboard() {
  return (
    <div className={layout.dashboard}>
      <div className={layout.guestBanner} role="region" aria-label="Guest mode notice">
        <div className={layout.guestCopy}>
          <LockIcon size={20} className={layout.guestIcon} />
          <p>
            <strong>You&rsquo;re browsing as a guest.</strong> Search and grade history are open — log in to track
            classes and build a schedule.
          </p>
        </div>
        <ButtonAnchor href={SIGN_IN_HREF}>Log in</ButtonAnchor>
      </div>
      <Greeting title="Welcome, Panther." />
      <FeatureCards mode="guest" />
      <WhatsNewLauncher member={false} />
    </div>
  );
}

/** The session lookup itself failed (database down): no numbers, just a way on. */
function AccountUnavailable() {
  return (
    <div className={layout.dashboard}>
      <Banner
        tone="warning"
        title="We couldn't load your account."
        action={
          <ButtonAnchor href="/dashboard" size="sm" variant="secondary">
            Try again
          </ButtonAnchor>
        }
      >
        Course search still works. Your tracked classes and schedule are safe; try again in a moment.
      </Banner>
      <Greeting title="Dashboard" />
      <FeatureCards mode="member-unknown" />
    </div>
  );
}
