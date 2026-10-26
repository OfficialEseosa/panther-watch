"use client";

import type { CSSProperties } from "react";
import { AlertIcon, ChevronRightIcon } from "@/components/ui/icons";
import { DAY_LABELS } from "@/lib/schedule/conflicts";
import { agendaDays, type PositionedBlock } from "./layout";
import { blockNameSuffix, colorVar } from "./format";
import styles from "./AgendaList.module.css";
import { formatTimeRange } from "@/lib/format";
import { displayTitle } from "@/components/courses/format";

export type AgendaListProps = {
  blocks: PositionedBlock[];
  onOpen: (crn: string) => void;
};

/** Agenda view: one list per day, chronological. Rows are buttons that open the block dialog. */
export function AgendaList({ blocks, onOpen }: AgendaListProps) {
  const groups = agendaDays(blocks);
  return (
    <div className={styles.agenda}>
      {groups.map(({ day, blocks: dayBlocks }) => (
        <section key={day} className={styles.day} aria-labelledby={`agenda-${day}`}>
          <h2 id={`agenda-${day}`} className={styles.dayTitle}>
            {DAY_LABELS[day].long}
          </h2>
          <ul className={styles.list}>
            {dayBlocks.map((block) => {
              const conflict = block.conflictsWith.length > 0;
              const section = block.course.section;
              return (
                <li key={block.id}>
                  <button
                    type="button"
                    className={styles.row}
                    data-conflict={conflict || undefined}
                    onClick={() => onOpen(block.crn)}
                    style={{ "--_color": colorVar(block.course.colorIndex) } as CSSProperties}
                  >
                    <span className={styles.bar} aria-hidden="true" />
                    <span className={styles.time}>{formatTimeRange(block.start, block.end)}</span>
                    <span className={styles.main}>
                      <span className={styles.code}>
                        {block.code}
                        {section.sequenceNumber ? ` · ${section.sequenceNumber}` : ""}
                        {conflict ? <AlertIcon size={16} className={styles.alert} /> : null}
                      </span>
                      <span className={styles.meta}>
                        {conflict ? (
                          <span className={styles.conflictText}>Conflicts with {block.conflictsWith.join(", ")}</span>
                        ) : (
                          displayTitle(section.courseTitle)
                        )}
                        {block.location ? <span className={styles.location}> · {block.location}</span> : null}
                      </span>
                    </span>
                    <ChevronRightIcon size={16} className={styles.chevron} />
                    <span className="sr-only">{blockNameSuffix(block)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
