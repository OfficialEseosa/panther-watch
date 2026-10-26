import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { DashboardSkeleton, MemberSectionsSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FeatureCards } from "@/components/dashboard/FeatureCards";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { GuestHero } from "@/components/dashboard/GuestHero";
import { Stat } from "@/components/ui/Stat";
import { firstName } from "@/lib/format";
import { loadDashboardSummary, type DashboardSummary } from "@/components/dashboard/summary.server";
import { WhatsNew } from "@/components/dashboard/WhatsNew";
import { PageHeader } from "@/components/shell/PageHeader";
import { Banner } from "@/components/ui/Banner";
import { ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { BellIcon, BookmarkIcon, CalendarIcon, SearchIcon } from "@/components/ui/icons";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import layout from "@/components/dashboard/Dashboard.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * /dashboard (pages.md §2). The page itself is static; everything that depends on the visitor
 * (the session cookie, then their watches and schedule) streams in behind <Suspense>, so the
 * shell and skeletons paint first (Cache Components). Database only: no GoSolar calls here.
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
  return <MemberDashboard userId={user.id} firstName={firstName(user.name)} />;
}

function SearchAction({ variant }: { variant?: "primary" | "secondary" }) {
  return (
    <ButtonLink href="/course-search" variant={variant} leadingIcon={<SearchIcon />}>
      Search classes
    </ButtonLink>
  );
}

function FeaturesSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={layout.section} aria-labelledby="dashboard-features-title">
      <h2 id="dashboard-features-title" className={layout.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

function MemberDashboard({ userId, firstName }: { userId: string; firstName: string | null }) {
  return (
    <div className={layout.stack}>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
        description="Your watched sections, seat alerts and schedule at a glance."
        actions={<SearchAction />}
      />
      <Suspense fallback={<MemberSectionsSkeleton />}>
        <MemberSections userId={userId} />
      </Suspense>
    </div>
  );
}

async function MemberSections({ userId }: { userId: string }) {
  let summary: DashboardSummary;
  try {
    summary = await loadDashboardSummary(userId);
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
        <FeaturesSection title="Jump back in">
          <FeatureCards mode="member-unknown" />
        </FeaturesSection>
      </>
    );
  }

  const { tracked, seatsOpened, scheduled } = summary;
  return (
    <>
      <section aria-labelledby="dashboard-stats-title">
        <h2 id="dashboard-stats-title" className="sr-only">
          At a glance
        </h2>
        {/* Scrolls sideways on phones, so it must be reachable by keyboard (axe scrollable-region-focusable). */}
        <div className={layout.stats} role="group" aria-labelledby="dashboard-stats-title" tabIndex={0}>
          <Stat
            label="Tracked"
            value={tracked}
            icon={<BookmarkIcon />}
            helper={
              tracked === 0
                ? "Watch a full section to get alerts"
                : tracked === 1
                  ? "Section we’re watching"
                  : "Sections we’re watching"
            }
          />
          <Stat
            label="Seats opened"
            value={seatsOpened}
            tone={seatsOpened > 0 ? "success" : "default"}
            icon={<BellIcon />}
            helper={seatsOpened > 0 ? "We emailed you. Register soon." : "We’ll email you when one opens"}
          />
          <Stat
            label="Scheduled"
            value={scheduled.count}
            icon={<CalendarIcon />}
            helper={
              scheduled.termLabel
                ? `${scheduled.count === 1 ? "Class" : "Classes"} scheduled for ${scheduled.termLabel}`
                : "Nothing planned for an upcoming term"
            }
          />
        </div>
      </section>

      <FeaturesSection title="Jump back in">
        <FeatureCards
          mode="member"
          counts={{ tracked, scheduled: scheduled.count, scheduledTermLabel: scheduled.termLabel }}
        />
      </FeaturesSection>

      <div className={layout.extras}>
        <GettingStarted tracked={tracked > 0} scheduled={summary.hasSchedule} />
        <WhatsNew />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Guests and failures
// ---------------------------------------------------------------------------------------------

function GuestDashboard() {
  return (
    <div className={layout.stack}>
      <PageHeader
        title="Welcome to PantherWatch"
        description="Live seat counts, grade history and professor ratings for Georgia State classes."
        actions={<SearchAction variant="secondary" />}
      />
      <GuestHero />
      <FeaturesSection title="What you can do">
        <FeatureCards mode="guest" />
      </FeaturesSection>
    </div>
  );
}

/** The session lookup itself failed (database down): no guest pitch, no numbers, just a way on. */
function AccountUnavailable() {
  return (
    <div className={layout.stack}>
      <PageHeader title="Dashboard" actions={<SearchAction />}>
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
      </PageHeader>
      <FeaturesSection title="Jump back in">
        <FeatureCards mode="member-unknown" />
      </FeaturesSection>
    </div>
  );
}
