import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Brand } from "@/components/shell/Brand";
import { SIGN_IN_HREF } from "@/components/shell/nav";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SkipLink } from "@/components/shell/SkipLink";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { ButtonAnchor, ButtonLink, buttonClassName } from "@/components/ui/Button";
import { BellIcon, CalendarIcon, ChartIcon, CheckIcon, SearchIcon } from "@/components/ui/icons";
import { Meter } from "@/components/ui/Meter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: { absolute: "PantherWatch · Track Georgia State class seats" },
};

const AUTH_ERRORS: Record<string, string> = {
  invalid_state: "Your sign-in took too long or was started in another tab. Please try again.",
  access_denied: "Google sign-in was cancelled. You can try again whenever you're ready.",
  account_conflict:
    "This email is already linked to a different Google account. Sign in with that account, or contact us for help.",
  unverified_email: "Your Google account's email address isn't verified yet. Verify it with Google, then try again.",
  login_failed: "Something went wrong on our side while signing you in. Please try again in a moment.",
};

const MEMBER_PAGES: Record<string, string> = {
  "/tracked-classes": "your tracked classes",
  "/schedule-builder": "the schedule builder",
  "/settings": "settings",
  "/admin": "the admin pages",
};

/** The page a signed-out visitor was sent here from (proxy.ts adds `?next=`), if it's one we gate. */
function memberPageName(next: string | undefined): string | null {
  if (!next) return null;
  const key = Object.keys(MEMBER_PAGES).find((base) => next === base || next.startsWith(`${base}/`));
  return key ? MEMBER_PAGES[key] : null;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Notices above the hero: a friendly banner for /?auth_error=… (audit bug #8), or, when
 * proxy.ts bounced a signed-out visitor from a members-only page (/?next=…), a note saying
 * why. `next` is only read to name the page: the login route has no redirect target, so
 * signing in always lands on /dashboard.
 */
async function Notices({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const code = first(params.auth_error);
  if (code) {
    return (
      <div className={styles.notice}>
        <Banner
          tone="danger"
          role="alert"
          title="Sign-in didn't complete."
          action={
            <ButtonAnchor href={SIGN_IN_HREF} size="sm" variant="secondary">
              Try again
            </ButtonAnchor>
          }
        >
          {AUTH_ERRORS[code] ?? "Please try again."}
        </Banner>
      </div>
    );
  }
  const page = memberPageName(first(params.next));
  if (!page) return null;
  return (
    <div className={styles.notice}>
      <Banner
        tone="info"
        title="Sign in to continue."
        action={
          <ButtonAnchor href={SIGN_IN_HREF} size="sm" variant="secondary">
            Sign in
          </ButtonAnchor>
        }
      >
        You need a PantherWatch account to open {page}. Signing in with Google takes a few seconds.
      </Banner>
    </div>
  );
}

/** Static, inert sample of the course card (the real CourseCard can replace this markup). */
function SampleCard() {
  return (
    <div className={styles.sample} inert aria-hidden="true">
      <div className={styles.sampleTop}>
        <p className={styles.eyebrow}>CSC 2720 · 003</p>
        <div className={styles.sampleActions}>
          <span className={buttonClassName({ variant: "secondary", size: "sm" })} aria-pressed="true">
            <CheckIcon size={16} />
            Added
          </span>
          <span className={buttonClassName({ variant: "secondary", size: "sm" })} aria-pressed="true">
            <CheckIcon size={16} />
            Watching
          </span>
        </div>
      </div>
      <p className={styles.sampleTitle}>Data Structures</p>
      <p className={styles.sampleMeta}>
        <span className="tabular">CRN 81234</span> · 3 credits · In person
      </p>
      <Meter enrolled={37} capacity={40} className={styles.sampleMeter} />
      <div className={styles.meeting}>
        <span className={styles.days}>
          {["M", "T", "W", "R", "F"].map((day) => (
            <span key={day} className={day === "M" || day === "W" ? styles.dayOn : styles.day}>
              {day}
            </span>
          ))}
        </span>
        <span className={styles.time}>10:00 – 11:15 AM</span>
        <span className={styles.room}>Langdale 405</span>
      </div>
      <div className={styles.instructor}>
        <span className={styles.instructorName}>Dr. Jane Smith</span>
        <span className={styles.badges}>
          <Badge tone="success">GPA 3.12</Badge>
          <span className={styles.rmp}>
            <Image src="/brand/rmp.svg" alt="" width={28} height={16} unoptimized />
            4.1
          </span>
        </span>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: <SearchIcon />,
    title: "Live seat counts",
    body: "Search by term, subject and course number, and see open seats for every section as you browse.",
  },
  {
    icon: <BellIcon />,
    title: "Email when a seat opens",
    body: "Watch a full section and we’ll email you the moment a seat or waitlist spot opens — no refreshing GoSolar.",
  },
  {
    icon: <ChartIcon />,
    title: "Grade history and professor ratings",
    body: "Compare how each instructor has graded past sections and how students rate them, side by side.",
  },
  {
    icon: <CalendarIcon />,
    title: "Plan your week and export to your calendar",
    body: "Lay out your classes on a weekly grid, catch overlaps early, and export to Google or Apple Calendar.",
  },
];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className={styles.page}>
      <SkipLink />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand href="/" size={40} priority className={styles.brand} />
          <div className={styles.headerActions}>
            <ThemeToggle />
            <ButtonAnchor href={SIGN_IN_HREF} size="sm">
              Sign in
            </ButtonAnchor>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className={styles.main}>
        <Suspense fallback={null}>
          <Notices searchParams={searchParams} />
        </Suspense>

        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title" className={styles.heroTitle}>
                Track seats.
                <br />
                Enroll faster.
              </h1>
              <p className={styles.heroLead}>
                PantherWatch watches Georgia State course sections in real time and emails you the moment a seat
                opens &mdash; so you can grab it before anyone else does.
              </p>
              <div className={styles.heroActions}>
                <ButtonAnchor href={SIGN_IN_HREF} size="lg" className={styles.heroButton}>
                  Sign in with Google
                </ButtonAnchor>
                <ButtonLink href="/course-search" size="lg" variant="secondary" className={styles.heroButton}>
                  Search as guest
                </ButtonLink>
              </div>
              <p className={styles.heroNote}>Free to use. Designed around how Panthers search and register.</p>
            </div>
            <SampleCard />
          </div>
        </section>

        <section className={styles.features} aria-labelledby="features-title">
          <h2 id="features-title" className="sr-only">
            What PantherWatch does
          </h2>
          <ul className={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <li key={feature.title} className={styles.feature}>
                <span className={styles.featureIcon} aria-hidden="true">
                  {feature.icon}
                </span>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureBody}>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
