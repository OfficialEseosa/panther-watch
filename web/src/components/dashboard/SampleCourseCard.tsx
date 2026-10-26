import Image from "next/image";
import { cn } from "@/lib/ui/cn";
import { CalendarIcon, EyeIcon } from "@/components/ui/icons";
import styles from "./SampleCourseCard.module.css";

const DAYS: [string, boolean][] = [
  ["Sun", false],
  ["Mon", true],
  ["Tue", false],
  ["Wed", true],
  ["Thu", false],
  ["Fri", true],
  ["Sat", false],
];

/** A share of each grade bucket, for the sample grade bar. */
const GRADES: [key: "a" | "b" | "c" | "d" | "f", pct: number][] = [
  ["a", 29],
  ["b", 38],
  ["c", 20],
  ["d", 8],
  ["f", 5],
];

const ENROLLMENT: [value: string, label: string, available?: boolean][] = [
  ["12", "Available", true],
  ["28", "Enrolled"],
  ["40", "Capacity"],
  ["0", "Waitlist count"],
  ["10", "Waitlist capacity"],
];

export type SampleCourseCardProps = {
  /** Show the ratings chip and the grade line (the showcase reveals them; the landing page shows them). */
  reveal?: boolean;
  className?: string;
};

/**
 * A static, inert copy of the course card (components/courses/CourseCard): tinted header with
 * the course and CRN chip and the Calendar/Watch buttons, the Course title / Section / Credits
 * grid, the five enrollment numbers, the instructor with the Rate My Professors pill, the meeting
 * box with the day circles, and the GPA + grade bar. Decorative (landing hero, What's new
 * showcase), so it's hidden from assistive tech and inert.
 */
export function SampleCourseCard({ reveal = true, className }: SampleCourseCardProps) {
  return (
    <div className={cn(styles.card, className)} data-reveal={reveal || undefined} inert aria-hidden="true">
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <p className={styles.title}>Computer Science (CSC 4520)</p>
          <span className={styles.crn}>CRN 12345</span>
        </div>
        <div className={styles.actions}>
          <span className={styles.calendarButton}>
            <CalendarIcon size={18} />
          </span>
          <span className={styles.watchButton}>
            <EyeIcon size={18} /> Watch
          </span>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.info}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Course title</span>
            <span className={styles.infoValue}>Algorithms</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Section</span>
            <span className={styles.infoValue}>001</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Credits</span>
            <span className={styles.infoValue}>4</span>
          </div>
        </div>

        <div className={styles.enrollment}>
          {ENROLLMENT.map(([value, label, available]) => (
            <div key={label} className={styles.enrollmentItem}>
              <span className={cn(styles.enrollmentNumber, available && styles.available)}>{value}</span>
              <span className={styles.enrollmentLabel}>{label}</span>
            </div>
          ))}
        </div>

        <div className={styles.faculty}>
          <div className={styles.facultyTitle}>Instructor</div>
          <div className={styles.facultyName}>
            <span className={styles.facultyNameText}>Alina Nemira</span>
            <span className={styles.rmp}>
              <Image src="/brand/rmp.svg" alt="" width={35} height={20} unoptimized className={styles.rmpLogo} />
              <span className={styles.rmpScore}>4.1</span>
            </span>
          </div>
        </div>

        <div className={styles.meeting}>
          <div className={styles.timeRow}>
            <span className={styles.timeRange}>10:00–10:50 AM</span>
            <span className={styles.days}>
              {DAYS.map(([day, on]) => (
                <span key={day} className={cn(styles.day, on && styles.dayOn)}>
                  {day}
                </span>
              ))}
            </span>
          </div>
          <div className={styles.location}>
            <span className={styles.building}>Classroom South 404</span>
          </div>
        </div>

        <div className={styles.gradeLine}>
          <div className={styles.gpa}>
            <span className={styles.gpaNum}>3.12</span>
            <span className={styles.gpaLabel}>avg GPA</span>
          </div>
          <span className={styles.gradeBar}>
            {GRADES.map(([key, pct]) => (
              <span key={key} className={cn(styles.gradeSeg, styles[key])} style={{ width: `${pct}%` }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
