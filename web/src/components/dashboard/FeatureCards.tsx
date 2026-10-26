import type { ReactNode } from "react";
import { SIGN_IN_HREF } from "@/components/shell/nav";
import { plural } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLink, cardClasses } from "@/components/ui/Card";
import { ArrowRightIcon, BookmarkIcon, CalendarIcon, LockIcon, SearchIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import styles from "./FeatureCards.module.css";

export type FeatureCounts = {
  tracked: number;
  scheduled: number;
  scheduledTermLabel: string | null;
};

export type FeatureCardsProps =
  /** Signed in, with real counts. */
  | { mode: "member"; counts: FeatureCounts }
  /** Signed in, but the counts couldn't load: plain links, no counts. */
  | { mode: "member-unknown" }
  /** Signed out: Tracked and Schedule point at sign-in. */
  | { mode: "guest" };

type Feature = {
  key: string;
  icon: ReactNode;
  title: string;
  body: string;
  href: string;
  /** A plain <a> (route handler, never prefetched) rather than a client-side Link. */
  external?: boolean;
  meta: ReactNode;
};


function features(props: FeatureCardsProps): Feature[] {
  const guest = props.mode === "guest";
  const counts = props.mode === "member" ? props.counts : null;
  const locked = (label: string) => (
    <Badge tone="neutral" icon={<LockIcon />}>
      {label}
    </Badge>
  );
  const go = (label: string) => (
    <span className={styles.go}>
      {label}
      <ArrowRightIcon size={16} />
    </span>
  );

  return [
    {
      key: "search",
      icon: <SearchIcon />,
      title: "Course search",
      body: "Live seat counts for every section, with grade history, professor ratings and syllabi.",
      href: "/course-search",
      meta: go("Search classes"),
    },
    {
      key: "tracked",
      icon: <BookmarkIcon />,
      title: "Tracked classes",
      body: "Watch a full section and we’ll email you the moment a seat or waitlist spot opens.",
      href: guest ? SIGN_IN_HREF : "/tracked-classes",
      external: guest,
      meta: guest
        ? locked("Sign in to track")
        : counts
          ? counts.tracked > 0
            ? <Badge tone="accent">{plural(counts.tracked, "section", "sections")} watched</Badge>
            : <Badge tone="neutral">Nothing watched yet</Badge>
          : go("Open tracked classes"),
    },
    {
      key: "schedule",
      icon: <CalendarIcon />,
      title: "Schedule builder",
      body: "Lay out your week, spot time conflicts early, and export to Google or Apple Calendar.",
      href: guest ? SIGN_IN_HREF : "/schedule-builder",
      external: guest,
      meta: guest
        ? locked("Sign in to plan")
        : counts
          ? counts.scheduled > 0 && counts.scheduledTermLabel
            ? <Badge tone="accent">{plural(counts.scheduled, "class", "classes")} · {counts.scheduledTermLabel}</Badge>
            : <Badge tone="neutral">Nothing planned yet</Badge>
          : go("Open schedule builder"),
    },
  ];
}

/**
 * The three feature cards (pages.md §2). Each whole card is a link (stretched-link pattern,
 * spec.md §2.5); for guests the members-only cards go straight to Google sign-in.
 */
export function FeatureCards(props: FeatureCardsProps) {
  return (
    <ul className={styles.grid}>
      {features(props).map((feature) => (
        <Card key={feature.key} as="li" interactive className={styles.card} bodyClassName={styles.body}>
          <span className={styles.icon} aria-hidden="true">
            {feature.icon}
          </span>
          <h3 className={styles.title}>
            {feature.external ? (
              <a href={feature.href} className={cardClasses.stretchedLink}>
                {feature.title}
              </a>
            ) : (
              <CardLink href={feature.href}>{feature.title}</CardLink>
            )}
          </h3>
          <p className={styles.text}>{feature.body}</p>
          <div className={styles.meta}>{feature.meta}</div>
        </Card>
      ))}
    </ul>
  );
}

export function FeatureCardsSkeleton() {
  return (
    <ul className={styles.grid}>
      {[0, 1, 2].map((index) => (
        <Card key={index} as="li" className={styles.card} bodyClassName={styles.body}>
          <SkeletonGroup label="Loading">
            <Skeleton width={40} height={40} radius="md" />
            <div className={styles.title}>
              <Skeleton width="55%" height={16} />
            </div>
            <div className={styles.text}>
              <Skeleton width="100%" height={12} />
              <Skeleton width="80%" height={12} style={{ marginTop: "var(--space-2)" }} />
            </div>
            <div className={styles.meta}>
              <Skeleton width={110} height={22} radius="full" />
            </div>
          </SkeletonGroup>
        </Card>
      ))}
    </ul>
  );
}
