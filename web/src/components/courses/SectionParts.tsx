import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { DAY_SHORT, meetingRows, type DayKey, type Section } from "./format";
import { OldIcon } from "./icons";
import styles from "./SectionParts.module.css";

/** Old getEnrollmentStatus: full at 0, low at <= 20% of capacity. */
function seatTone(available: number | null | undefined, capacity: number | null | undefined): string {
  if (available == null || capacity == null) return styles.seatsUnknown;
  if (available <= 0) return styles.seatsFull;
  if (available <= capacity * 0.2) return styles.seatsLow;
  return styles.seatsAvailable;
}

/** Old getWaitlistStatus (null when the section has no waitlist). */
function waitlistTone(waitAvailable: number | null | undefined, waitCapacity: number | null | undefined): string | null {
  if (waitAvailable == null || !waitCapacity) return null;
  if (waitAvailable <= 0) return styles.seatsFull;
  if (waitAvailable <= waitCapacity * 0.2) return styles.seatsLow;
  return styles.seatsAvailable;
}

function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: string | null }) {
  return (
    <div className={styles.enrollmentItem}>
      <span className={cn(styles.enrollmentNumber, tone)}>{value}</span>{" "}
      <span className={styles.enrollmentLabel}>{label}</span>
      {/* Separates "3 Available" from the next number for screen readers. */}
      <span className="sr-only">. </span>
    </div>
  );
}

/** The original enrollment panel: Available / Enrolled / Capacity, plus the waitlist when it has one. */
export function EnrollmentStatus({ section, compact = false }: { section: Section; compact?: boolean }) {
  const wait = waitlistTone(section.waitAvailable, section.waitCapacity);
  return (
    <div className={cn(styles.enrollment, compact && styles.compact)} data-count={wait ? 5 : 3}>
      <Stat
        value={Math.max(0, section.seatsAvailable)}
        label="Available"
        tone={seatTone(section.seatsAvailable, section.maximumEnrollment)}
      />
      <Stat value={section.enrollment} label="Enrolled" />
      <Stat value={section.maximumEnrollment} label="Capacity" />
      {wait ? (
        <>
          <Stat value={section.waitCount ?? "N/A"} label="Waitlist count" tone={wait} />
          <Stat value={section.waitCapacity ?? "N/A"} label="Waitlist capacity" />
        </>
      ) : null}
    </div>
  );
}

/** Old label order: Sun first. */
const WEEK: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** The original meeting boxes: time range and day circles, then the building and room. */
export function MeetingTimes({ section, compact = false }: { section: Section; compact?: boolean }) {
  const rows = meetingRows(section);
  if (rows.length === 0) return null;
  return (
    <ul className={cn(styles.meetings, compact && styles.compact)}>
      {rows.map((row, i) => (
        <li key={i} className={styles.meeting}>
          <div className={styles.timeRow}>
            <span className={styles.time}>{row.time ?? (row.online ? "Online · asynchronous" : "Time TBA")}</span>
            <span className={styles.days}>
              <span className="sr-only">{row.days.length ? row.days.map((d) => DAY_SHORT[d]).join(", ") : "No set days"}</span>
              {WEEK.map((day) => (
                <span key={day} className={styles.day} data-active={row.days.includes(day) || undefined} aria-hidden="true">
                  {DAY_SHORT[day]}
                </span>
              ))}
            </span>
          </div>
          <div className={styles.location}>
            <span className={styles.building}>{row.location ?? (row.online ? "Online" : "Location TBA")}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The original amber "Limited enrollment data" notice, used for partial and stale data. */
export function CardNotice({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "info" }) {
  return (
    <p className={cn(styles.notice, tone === "info" && styles.noticeInfo)}>
      <span className={styles.noticeIcon} aria-hidden="true">
        {"ⓘ"}
      </span>
      <span className={styles.noticeText}>{children}</span>
    </p>
  );
}

/** The original quiet "tracking ends soon" line. */
export function ExpiryNotice({ children }: { children: ReactNode }) {
  return (
    <p className={styles.expiry}>
      <OldIcon name="time" size={14} />
      <span>{children}</span>
    </p>
  );
}

/** The original red `.error-message` box, with an optional action on the right. */
export function ErrorMessage({
  children,
  action,
  role = "alert",
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div className={cn(styles.error, className)} role={role}>
      <span>{children}</span>
      {action ? <span className={styles.errorAction}>{action}</span> : null}
    </div>
  );
}
