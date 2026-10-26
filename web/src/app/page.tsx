import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SampleCardFlip } from "@/components/dashboard/SampleCardFlip";
import { SIGN_IN_HREF } from "@/components/shell/nav";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SkipLink } from "@/components/shell/SkipLink";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Banner } from "@/components/ui/Banner";
import { ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { BookmarkIcon, CalendarIcon, ChartIcon, SearchIcon, UsersIcon } from "@/components/ui/icons";
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
 * A small notice under the header: /?auth_error=… (sign-in failed), or, when proxy.ts bounced a
 * signed-out visitor from a members-only page (/?next=…), why. Signing in always lands on
 * /dashboard.
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
        You need a PantherWatch account to open {page}.
      </Banner>
    </div>
  );
}

const HIGHLIGHTS = [
  { icon: <SearchIcon size={18} />, label: "Fast, focused search" },
  { icon: <BookmarkIcon size={18} />, label: "Track CRNs easily" },
  { icon: <ChartIcon size={18} />, label: "Clear, helpful insights" },
];

const FEATURES = [
  {
    icon: <SearchIcon size={22} />,
    title: "Powerful search",
    body: "Filter by term, subject, and course details — see live seat counts as you browse.",
  },
  {
    icon: <BookmarkIcon size={22} />,
    title: "Track classes",
    body: "Save CRNs to your watchlist and keep tabs on openings without refreshing.",
  },
  {
    icon: <CalendarIcon size={22} />,
    title: "Stay organized",
    body: "Clean dashboard keeps your tracked list and next steps front and center.",
  },
  {
    icon: <UsersIcon size={22} />,
    title: "Built for students",
    body: "Simple, fast, and reliable — designed around how Panthers search and register.",
  },
];

/** The landing page: the original Home (old Home.jsx), plus the sample course card in the hero. */
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className={styles.home}>
      <SkipLink />

      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerContainer}`}>
          <Link href="/" className={styles.brand}>
            <Image
              src="/brand/panther-128.webp"
              alt=""
              width={48}
              height={38}
              priority
              unoptimized
              className={styles.brandLogo}
            />
            <span className={styles.brandName}>PantherWatch</span>
          </Link>
          <div className={styles.headerActions}>
            <a href={SIGN_IN_HREF} className={styles.loginButton}>
              Log in
            </a>
          </div>
        </div>
      </header>

      <ThemeToggle className={styles.floatingThemeToggle} tooltipPlacement="top" />

      <main id="main" tabIndex={-1} className={styles.main}>
        <Suspense fallback={null}>
          <Notices searchParams={searchParams} />
        </Suspense>

        <section className={styles.heroSection} aria-labelledby="hero-title">
          <div className={`${styles.container} ${styles.hero}`}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title">Track seats. Enroll faster.</h1>
              <p>
                PantherWatch monitors Georgia State course availability in real time — search by term and subject,
                track specific CRNs, and get ready to grab seats the moment they open.
              </p>
              <div className={styles.heroActions}>
                <ButtonAnchor href={SIGN_IN_HREF} size="lg">
                  Get Started
                </ButtonAnchor>
                <ButtonLink href="/dashboard" size="lg" variant="secondary">
                  Continue without logging in
                </ButtonLink>
              </div>
              <ul className={styles.heroHighlights}>
                {HIGHLIGHTS.map((item) => (
                  <li key={item.label} className={styles.highlight}>
                    {item.icon} {item.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.heroCard}>
              <SampleCardFlip />
            </div>
          </div>
        </section>

        <section className={`${styles.container} ${styles.section}`} aria-labelledby="features-title">
          <h2 id="features-title" className="sr-only">
            What PantherWatch does
          </h2>
          <ul className={styles.features}>
            {FEATURES.map((feature) => (
              <li key={feature.title} className={styles.feature}>
                <span className={styles.featureIcon} aria-hidden="true">
                  {feature.icon}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
