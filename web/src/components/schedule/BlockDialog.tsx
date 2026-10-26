"use client";

import { useId } from "react";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TrashIcon } from "@/components/ui/icons";
import type { ScheduleEntry } from "@/lib/client/schedule";
import { DAY_LABELS, meetingsOf, type Conflict } from "@/lib/schedule/conflicts";
import { meetingLocation } from "./layout";
import { ColorPicker } from "./ColorPicker";
import { seatSummary } from "./format";
import type { Resolution } from "./useSectionResolver";
import styles from "./BlockDialog.module.css";
import { creditsLabel, courseCode, formatTimeRange, instructorOf } from "@/lib/format";
import { displayTitle } from "@/components/courses/format";

export type BlockDialogProps = {
  open: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null;
  resolution: Resolution | null;
  /** Conflicts involving this entry's CRN, with the other course's code. */
  conflicts: Array<{ other: string; conflict: Conflict }>;
  onColor: (entry: ScheduleEntry, colorIndex: number) => void;
  onRemove: (entry: ScheduleEntry) => void;
};

/** Details of a scheduled class (from a block, agenda row or legend item): color and Remove. */
export function BlockDialog({ open, onClose, entry, resolution, conflicts, onColor, onRemove }: BlockDialogProps) {
  const section = resolution?.section ?? null;
  const code = entry ? courseCode(entry.subject, entry.courseNumber) : "";
  const seq = section?.sequenceNumber;
  const title = entry ? (seq ? `${code} · ${seq}` : code) : "";
  const meetings = section ? meetingsOf(section) : [];
  const instructor = section ? instructorOf(section) : null;
  const seats = section ? seatSummary(section) : null;
  const id = useId();

  return (
    <Dialog
      open={open && entry !== null}
      onClose={onClose}
      title={title}
      subtitle={displayTitle(section?.courseTitle ?? entry?.courseTitle) || undefined}
      size="md"
      initialFocus="heading"
      footer={
        entry ? (
          <>
            <Button variant="danger-ghost" leadingIcon={<TrashIcon />} onClick={() => onRemove(entry)}>
              Remove from schedule
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : null
      }
    >
      {entry ? (
        <div className={styles.body}>
          {conflicts.length > 0 ? (
            <Banner tone="danger" title={`Overlaps ${conflicts.map((c) => c.other).join(" and ")}`}>
              {conflicts.map((c) => c.conflict.label).join("; ")}. Both stay on your schedule; GoSolar enforces real
              conflicts at registration.
            </Banner>
          ) : null}
          {resolution?.status === "missing" ? (
            <Banner tone="warning" title="No longer listed">
              GoSolar doesn&rsquo;t list CRN {entry.crn} for this term anymore. It may have been cancelled or renumbered.
            </Banner>
          ) : null}
          {resolution?.status === "failed" ? (
            <Banner tone="warning" title="Live details unavailable">
              Couldn&rsquo;t load meeting times from GoSolar. Try again from the schedule page.
            </Banner>
          ) : null}

          <dl className={styles.facts}>
            <div>
              <dt>CRN</dt>
              <dd className={styles.mono}>{entry.crn}</dd>
            </div>
            {instructor ? (
              <div>
                <dt>Instructor</dt>
                <dd>{instructor}</dd>
              </div>
            ) : null}
            {section ? (
              <div>
                <dt>Credits</dt>
                <dd>{creditsLabel(section) ?? "—"}</dd>
              </div>
            ) : null}
            {seats && section ? (
              <div>
                <dt>Seats</dt>
                <dd className={styles.seats}>
                  <Badge tone={seats.tone}>{seats.text}</Badge>
                  <span className={styles.muted}>
                    {section.enrollment} of {section.maximumEnrollment} taken
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>

          {section ? (
            <section aria-labelledby={`${id}-meetings`} className={styles.section}>
              <h3 id={`${id}-meetings`} className={styles.heading}>
                Meetings
              </h3>
              {meetings.length === 0 ? (
                <p className={styles.muted}>Online or to be announced: no set meeting time.</p>
              ) : (
                <ul className={styles.meetings}>
                  {meetings.map((meeting, index) => (
                    <li key={index}>
                      <span className={styles.days}>{meeting.days.map((day) => DAY_LABELS[day].short).join(", ")}</span>
                      <span className={styles.mono}>{formatTimeRange(meeting.start, meeting.end)}</span>
                      <span className={styles.muted}>
                        {meetingLocation(meeting.meetingTime.buildingDescription, meeting.meetingTime.room) ?? "Room TBA"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section aria-labelledby={`${id}-color`} className={styles.section}>
            <h3 id={`${id}-color`} className={styles.heading}>
              Schedule color
            </h3>
            <ColorPicker
              label={`Color for ${code}`}
              value={entry.colorIndex}
              onChange={(index) => onColor(entry, index)}
            />
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}
