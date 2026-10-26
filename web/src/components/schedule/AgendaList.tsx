"use client";

import { ChevronRightIcon } from "@/components/ui/icons";
import type { ScheduleEntry } from "@/lib/client/schedule";
import { DAY_LABELS, formatMinutes } from "@/lib/schedule/conflicts";
import { agendaDays, meetingSummary, type PositionedBlock } from "./layout";
import { blockNameSuffix, colorHex } from "./format";
import type { Resolution } from "./useSectionResolver";
import styles from "./AgendaList.module.css";
import { courseCode } from "@/lib/format";
import { displayTitle } from "@/components/courses/format";

export type AgendaListProps = {
  blocks: PositionedBlock[];
  onOpen: (crn: string) => void;
};

/**
 * The original agenda list (old ScheduleCalendar.jsx): one card per day with chronological
 * rows that open the class dialog. Shown at 768 px and below, where the week grid is hidden.
 */
export function AgendaList({ blocks, onOpen }: AgendaListProps) {
  const groups = agendaDays(blocks);
  if (groups.length === 0) return null;
  return (
    <div className={styles.agenda}>
      {groups.map(({ day, blocks: dayBlocks }) => (
        <section key={day} className={styles.agendaDay} aria-labelledby={`agenda-${day}`}>
          <h3 id={`agenda-${day}`} className={styles.agendaDayTitle}>
            {DAY_LABELS[day].long}
          </h3>
          <div className={styles.agendaItems}>
            {dayBlocks.map((block) => {
              const conflict = block.conflictsWith.length > 0;
              const section = block.course.section;
              return (
                <button
                  key={block.id}
                  type="button"
                  className={styles.agendaItem}
                  data-conflict={conflict || undefined}
                  onClick={() => onOpen(block.crn)}
                >
                  <span className={styles.agendaColor} style={{ backgroundColor: colorHex(block.course.colorIndex) }} aria-hidden="true" />
                  <span className={styles.agendaTime}>
                    <span>{formatMinutes(block.start)}</span>
                    <span className={styles.agendaTimeEnd}>{formatMinutes(block.end)}</span>
                  </span>
                  <span className={styles.agendaInfo}>
                    <span className={styles.agendaCode}>
                      {block.code}
                      {section.sequenceNumber ? ` · ${section.sequenceNumber}` : ""}
                    </span>
                    <span className={styles.agendaTitle}>{displayTitle(section.courseTitle)}</span>
                    {block.location ? <span className={styles.agendaLocation}>{block.location}</span> : null}
                    {conflict ? (
                      <span className={styles.agendaConflict}>Conflicts with {block.conflictsWith.join(", ")}</span>
                    ) : null}
                  </span>
                  <ChevronRightIcon size={16} className={styles.agendaChevron} />
                  <span className="sr-only">{blockNameSuffix(block)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export type UnscheduledItem = {
  entry: ScheduleEntry;
  resolution: Resolution;
};

/**
 * Classes the grid can't place (online, TBA, or their live data is missing), as one more
 * agenda-style card so they are never silently dropped and can still be opened and removed.
 */
export function UnscheduledList({ items, onOpen }: { items: UnscheduledItem[]; onOpen: (crn: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className={`${styles.agendaDay} ${styles.unscheduled}`} aria-labelledby="agenda-unscheduled">
      <h3 id="agenda-unscheduled" className={styles.agendaDayTitle}>
        Online and unscheduled
      </h3>
      <div className={styles.agendaItems}>
        {items.map(({ entry, resolution }) => {
          const section = resolution.section;
          const seq = section?.sequenceNumber;
          const note =
            resolution.status === "ok" && section
              ? meetingSummary(section)
              : resolution.status === "missing"
                ? "No longer listed in GoSolar"
                : "Meeting times unavailable";
          return (
            <button key={entry.crn} type="button" className={styles.agendaItem} onClick={() => onOpen(entry.crn)}>
              <span className={styles.agendaColor} style={{ backgroundColor: colorHex(entry.colorIndex) }} aria-hidden="true" />
              <span className={styles.agendaInfo}>
                <span className={styles.agendaCode}>
                  {courseCode(entry.subject, entry.courseNumber)}
                  {seq ? ` · ${seq}` : ""}
                </span>
                <span className={styles.agendaTitle}>{displayTitle(section?.courseTitle ?? entry.courseTitle)}</span>
                <span className={resolution.status === "ok" ? styles.agendaLocation : styles.agendaWarning}>{note}</span>
              </span>
              <ChevronRightIcon size={16} className={styles.agendaChevron} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
