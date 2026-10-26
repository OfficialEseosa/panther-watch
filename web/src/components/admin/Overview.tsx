import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookmarkIcon, CalendarIcon, ChartIcon, MailIcon, UsersIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { EMAIL_DAILY_LIMIT, EMAIL_MONTHLY_LIMIT } from "@/lib/email/quota";
import type { JobRunDto } from "@/lib/client/admin";
import { RUN_STATE_LABEL, RUN_STATE_TONE, runState, summaryErrors, watcherFacts } from "./jobs";
import { LoadError, settle } from "./LoadError";
import { RelativeTime } from "./RelativeTime";
import { loadStats } from "./server";
import { Stat, StatSkeleton } from "@/components/ui/Stat";
import { BudgetBar } from "./BudgetBar";
import styles from "./admin.module.css";
import { formatNumber, termLabel } from "@/lib/format";

/** Overview tab (pages.md §8.1): usage tiles, the last watcher run and stored grade terms. */
export async function Overview() {
  const result = await settle(loadStats());
  if (!result.ok) return <LoadError what="the stats" />;
  const stats = result.data;
  const { emailBudget } = stats;
  return (
    <div className={styles.stack}>
      <section className={styles.section} aria-labelledby="admin-usage">
        <h2 id="admin-usage" className="sr-only">
          Usage
        </h2>
        <div className={styles.stats}>
          <Stat label="Users" value={stats.users} icon={<UsersIcon />} />
          <Stat label="Watched sections" value={stats.watches} icon={<BookmarkIcon />} />
          <Stat label="Schedule entries" value={stats.scheduleEntries} icon={<CalendarIcon />} />
          <Stat
            label="Watcher budget"
            value={emailBudget.watcherBudget}
            helper="Seat alerts the watcher may still send today"
          />
          <Stat label="Emails today" value={stats.emailsToday} icon={<MailIcon />}>
            <BudgetBar
              used={stats.emailsToday}
              limit={EMAIL_DAILY_LIMIT}
              caption={`${formatNumber(stats.emailsToday)} of ${formatNumber(EMAIL_DAILY_LIMIT)} · ${formatNumber(emailBudget.dailyRemaining)} left (resets 00:00 UTC)`}
            />
          </Stat>
          <Stat label="Emails this month" value={stats.emailsThisMonth} icon={<MailIcon />}>
            <BudgetBar
              used={stats.emailsThisMonth}
              limit={EMAIL_MONTHLY_LIMIT}
              caption={`${formatNumber(stats.emailsThisMonth)} of ${formatNumber(EMAIL_MONTHLY_LIMIT)} · ${formatNumber(emailBudget.monthlyRemaining)} left`}
            />
          </Stat>
        </div>
      </section>

      <WatcherRunCard run={stats.lastWatcherRun} />

      <section className={styles.section} aria-labelledby="admin-grade-terms">
        <div className={styles.sectionHead}>
          <h2 id="admin-grade-terms" className={styles.sectionTitle}>
            Grade terms on file
          </h2>
          <Link href="/admin/grades" className={styles.muted}>
            Manage grade data
          </Link>
        </div>
        {stats.gradeTerms.length > 0 ? (
          <ul className={styles.chips} aria-label={`${stats.gradeTerms.length} terms`}>
            {stats.gradeTerms.map((term) => (
              <li key={term}>
                <Badge>{termLabel(term)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>No grade terms stored yet. Upload one from Grade data.</p>
        )}
      </section>

      <div>
        <ButtonLink href="/dashboard?whatsnew=1" variant="secondary" prefetch={false}>
          Show &ldquo;What&rsquo;s new&rdquo; to me
        </ButtonLink>
      </div>
    </div>
  );
}

function WatcherRunCard({ run }: { run: JobRunDto | null }) {
  if (!run) {
    return (
      <Card title="Last watcher run">
        <EmptyState icon={<ChartIcon size={24} />} title="No watcher runs yet" headingAs="h3">
          The seat watcher records a run every time its cron fires.
        </EmptyState>
      </Card>
    );
  }
  const state = runState(run);
  const errors = summaryErrors(run.summary);
  return (
    <Card
      title="Last watcher run"
      actions={
        <Link href="/admin/jobs" className={styles.muted}>
          All runs
        </Link>
      }
    >
      <div className={styles.runHead}>
        <Badge tone={RUN_STATE_TONE[state]}>{RUN_STATE_LABEL[state]}</Badge>
        <span>
          Started <RelativeTime value={run.startedAt} />
        </span>
        <span aria-hidden="true">·</span>
        <span className={styles.numeric}>Run #{run.id}</span>
      </div>
      <dl className={styles.facts}>
        {watcherFacts(run).map((fact) => (
          <div key={fact.label} className={styles.fact}>
            <dt className={styles.capsLabel}>{fact.label}</dt>
            <dd className={styles.factValue}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {errors.length > 0 ? (
        <details className={styles.errors}>
          <summary className={styles.muted}>
            {errors.length === 1 ? "1 error" : `${formatNumber(errors.length)} errors`}
          </summary>
          <pre className={styles.code}>
            {errors.join("\n")}
          </pre>
        </details>
      ) : null}
    </Card>
  );
}

export function OverviewSkeleton() {
  return (
    <div className={styles.stack}>
      <div className={styles.stats}>
        {Array.from({ length: 6 }, (_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <SkeletonGroup label="Loading the last watcher run">
        <Skeleton height={180} radius="lg" />
      </SkeletonGroup>
    </div>
  );
}
