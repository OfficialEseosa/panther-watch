import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import styles from "./ScheduleSkeleton.module.css";

const HOURS = 10;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
/** Placeholder blocks: [day column, top hour offset, height in hours]. */
const BLOCKS: Array<[number, number, number]> = [
  [0, 2, 1.25],
  [2, 2, 1.25],
  [1, 1.5, 1.25],
  [3, 1.5, 1.25],
  [4, 5, 1.5],
];

/**
 * CalendarSkeleton (spec.md §2.12): hour rail + 5 day columns + placeholder blocks, the same
 * box sizes as WeekGrid so the swap does not shift layout. Server-safe (used by loading.tsx).
 */
export function CalendarSkeleton({ label = "Loading your schedule" }: { label?: string }) {
  return (
    <SkeletonGroup label={label} className={styles.frame}>
      <div className={styles.grid} style={{ ["--_days" as string]: DAYS.length, ["--_hours" as string]: HOURS }}>
        <div className={styles.corner} />
        {DAYS.map((day) => (
          <div key={day} className={styles.head}>
            <Skeleton width={32} height={12} />
          </div>
        ))}
        <div className={styles.rail}>
          {Array.from({ length: HOURS }, (_, hour) => (
            <Skeleton key={hour} width={28} height={10} className={styles.hour} style={{ top: `calc(var(--_hour) * ${hour})` }} />
          ))}
        </div>
        {DAYS.map((day, column) => (
          <div key={day} className={styles.col}>
            {BLOCKS.filter(([c]) => c === column).map(([, top, height]) => (
              <Skeleton
                key={top}
                radius="sm"
                width="calc(100% - 4px)"
                className={styles.block}
                style={{ top: `calc(var(--_hour) * ${top})`, height: `calc(var(--_hour) * ${height} - 2px)` }}
              />
            ))}
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** Whole-page skeleton for loading.tsx: header, toolbar and the calendar. */
export function SchedulePageSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Schedule</h1>
        <Skeleton width={180} height={14} />
      </div>
      <div className={styles.toolbar}>
        <Skeleton width={200} height={40} radius="md" />
        <Skeleton width={160} height={36} radius="md" />
      </div>
      <CalendarSkeleton />
    </div>
  );
}
