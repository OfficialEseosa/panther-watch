import type { ReactNode } from "react";
import { BookmarkIcon, CalendarIcon, ChartIcon, MailIcon, UsersIcon, BellIcon } from "@/components/ui/icons";
import { EMAIL_DAILY_LIMIT, EMAIL_MONTHLY_LIMIT } from "@/lib/email/quota";
import { cn } from "@/lib/ui/cn";
import { budgetTone } from "./format";
import { LoadError, settle } from "./LoadError";
import { loadStats } from "./server";
import styles from "./admin.module.css";
import { formatNumber } from "@/lib/format";

type Tone = "primary" | "success" | "warning" | "danger";

const TONE_CLASS: Record<Tone, string | undefined> = {
  primary: undefined,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

/** Statistics tab: the old "System overview" card grid (AdminStats.jsx), fed by the stats API. */
export async function Overview() {
  const result = await settle(loadStats());
  if (!result.ok) return <LoadError what="the stats" />;
  const stats = result.data;
  const { emailBudget } = stats;
  const dailyTone = budgetTone(stats.emailsToday, EMAIL_DAILY_LIMIT);
  const monthlyTone = budgetTone(stats.emailsThisMonth, EMAIL_MONTHLY_LIMIT);

  return (
    <section className={styles.section} aria-labelledby="admin-stats-title">
      <h2 id="admin-stats-title" className={styles.sectionHeading}>
        <ChartIcon size={22} />
        System overview
      </h2>
      <div className={styles.statsGrid}>
        <StatCard label="Total users" value={formatNumber(stats.users)} icon={<UsersIcon size={28} />} />
        <StatCard label="Watched sections" value={formatNumber(stats.watches)} icon={<BookmarkIcon size={28} />} tone="warning" />
        <StatCard label="Schedule entries" value={formatNumber(stats.scheduleEntries)} icon={<CalendarIcon size={28} />} tone="success" />
        <StatCard
          label="Emails today"
          value={formatNumber(stats.emailsToday)}
          hint={`of ${formatNumber(EMAIL_DAILY_LIMIT)} · ${formatNumber(emailBudget.dailyRemaining)} left, resets 00:00 UTC`}
          icon={<MailIcon size={28} />}
          tone={dailyTone === "success" ? "primary" : dailyTone}
        />
        <StatCard
          label="Emails this month"
          value={formatNumber(stats.emailsThisMonth)}
          hint={`of ${formatNumber(EMAIL_MONTHLY_LIMIT)} · ${formatNumber(emailBudget.monthlyRemaining)} left`}
          icon={<MailIcon size={28} />}
          tone={monthlyTone === "success" ? "primary" : monthlyTone}
        />
        <StatCard
          label="Watcher budget"
          value={formatNumber(emailBudget.watcherBudget)}
          hint="Seat alerts the watcher may still send today"
          icon={<BellIcon size={28} />}
        />
      </div>
    </section>
  );
}

function StatCard({ label, value, hint, icon, tone = "primary" }: { label: string; value: string; hint?: string; icon: ReactNode; tone?: Tone }) {
  return (
    <article className={cn(styles.statCard, TONE_CLASS[tone])} data-testid="stat">
      <div className={styles.statIcon} aria-hidden="true">
        {icon}
      </div>
      <div className={styles.statContent}>
        <p className={styles.statLabel}>{label}</p>
        <p className={styles.statValue} data-testid="stat-value">
          {value}
        </p>
        {hint ? <p className={styles.statHint}>{hint}</p> : null}
      </div>
    </article>
  );
}
