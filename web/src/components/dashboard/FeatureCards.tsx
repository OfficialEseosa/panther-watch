import { SIGN_IN_HREF } from "@/components/shell/nav";
import { ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { AnimatedIcon } from "@/components/shell/AnimatedIcon";
import { BookmarkIcon, CalendarIcon, LockIcon, SearchIcon, type IconComponent } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { cn } from "@/lib/ui/cn";
import styles from "./FeatureCards.module.css";

export type FeatureCardsProps =
  /** Signed in, with the tracked count. */
  | { mode: "member"; tracked: number }
  /** Signed in, but the count couldn't load: no badge. */
  | { mode: "member-unknown" }
  /** Signed out: Tracked and Schedule are locked and point at sign-in. */
  | { mode: "guest" };

type Feature = {
  key: string;
  icon: IconComponent;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  locked: boolean;
  badge?: string;
};

function features(props: FeatureCardsProps): Feature[] {
  const guest = props.mode === "guest";
  const tracked = props.mode === "member" ? props.tracked : null;
  return [
    {
      key: "search",
      icon: SearchIcon,
      title: "Course search",
      description:
        "Real-time seat availability plus grade history, Rate My Professors ratings, and syllabi for every section.",
      actionLabel: "Search courses",
      href: "/course-search",
      locked: false,
    },
    {
      key: "tracked",
      icon: BookmarkIcon,
      title: "Tracked classes",
      description: "Get an email the moment a seat opens in a full section you are watching.",
      actionLabel: guest ? "Sign in to track" : tracked ? "Manage tracked list" : "Start tracking",
      href: guest ? SIGN_IN_HREF : "/tracked-classes",
      locked: guest,
      badge: tracked === null ? undefined : `${tracked} active`,
    },
    {
      key: "schedule",
      icon: CalendarIcon,
      title: "Schedule builder",
      description:
        "Build your week from search results or tracked classes, spot conflicts on the calendar, and export to Google or Apple Calendar.",
      actionLabel: guest ? "Sign in to plan" : "Open schedule builder",
      href: guest ? SIGN_IN_HREF : "/schedule-builder",
      locked: guest,
    },
  ];
}

/**
 * The three feature cards of the original dashboard (old Dashboard.jsx / .dashboard-card):
 * icon tile, title, description, and a footer with the count badge and the action button.
 * For guests the members-only cards show a lock and their button goes to Google sign-in
 * (the original disabled it, a dead end).
 */
export function FeatureCards(props: FeatureCardsProps) {
  return (
    <ul className={styles.grid} aria-label="Features">
      {features(props).map((card) => (
        <li
          key={card.key}
          className={cn(styles.card, card.locked && styles.locked)}
          data-card={card.key}
          data-anim-host={card.locked ? undefined : true}
        >
          <span className={styles.icon} aria-hidden="true">
            {card.locked ? <LockIcon size={28} /> : <AnimatedIcon>
                <card.icon size={28} />
              </AnimatedIcon>}
          </span>
          <h2 className={styles.title}>{card.title}</h2>
          <p className={styles.description}>{card.description}</p>
          <div className={styles.footer}>
            {card.badge ? <span className={styles.badge}>{card.badge}</span> : <span />}
            {card.locked ? (
              <ButtonAnchor href={card.href} variant="secondary" leadingIcon={<LockIcon size={16} />}>
                {card.actionLabel}
              </ButtonAnchor>
            ) : (
              <ButtonLink href={card.href}>{card.actionLabel}</ButtonLink>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FeatureCardsSkeleton() {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <li key={index} className={styles.card}>
          <SkeletonGroup label="Loading">
            <Skeleton width={48} height={48} radius="md" />
            <div className={styles.skeletonText}>
              <Skeleton width="55%" height={18} />
              <Skeleton width="100%" height={12} style={{ marginTop: "var(--space-3)" }} />
              <Skeleton width="80%" height={12} style={{ marginTop: "var(--space-2)" }} />
            </div>
            <div className={styles.footer}>
              <span />
              <Skeleton width={140} height={40} radius="sm" />
            </div>
          </SkeletonGroup>
        </li>
      ))}
    </ul>
  );
}
