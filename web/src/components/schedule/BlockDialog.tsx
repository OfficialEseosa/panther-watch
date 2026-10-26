"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TrashIcon } from "@/components/ui/icons";
import type { ScheduleEntry } from "@/lib/client/schedule";
import { DAY_LABELS, type Conflict } from "@/lib/schedule/conflicts";
import { meetingLocation } from "./layout";
import { ColorPicker } from "./ColorPicker";
import { seatText, timeLabel, weekOrderedMeetings } from "./format";
import type { Resolution } from "./useSectionResolver";
import styles from "./BlockDialog.module.css";
import { creditsLabel, courseCode, instructorOf } from "@/lib/format";
import { displayTitle } from "@/components/courses/format";

export type BlockDialogProps = {
  open: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null;
  termLabel: string;
  resolution: Resolution | null;
  /** Conflicts involving this entry's CRN, with the other course's code. */
  conflicts: Array<{ other: string; conflict: Conflict }>;
  onColor: (entry: ScheduleEntry, colorIndex: number) => void;
  onRemove: (entry: ScheduleEntry) => void;
};

/**
 * A scheduled class, opened from a calendar block or agenda row: the old expanded card header
 * (code, title, CRN/section/credits tags, calendar color swatches), its meetings, and Remove.
 */
export function BlockDialog({ open, onClose, entry, termLabel, resolution, conflicts, onColor, onRemove }: BlockDialogProps) {
  const section = resolution?.section ?? null;
  const code = entry ? courseCode(entry.subject, entry.courseNumber) : "";
  const seq = section?.sequenceNumber;
  const title = entry ? (seq ? `${code} · ${seq}` : code) : "";
  const meetings = section ? weekOrderedMeetings(section) : [];
  const instructor = section ? instructorOf(section) : null;
  const seats = section ? seatText(section) : null;
  const credits = section ? creditsLabel(section) : null;

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
          <div className={styles.tags}>
            <span className={`${styles.tag} ${styles.tagCrn}`}>CRN {entry.crn}</span>
            {seq ? <span className={styles.tag}>Section {seq}</span> : null}
            {credits ? <span className={styles.tag}>{credits}</span> : null}
            <span className={styles.tag}>{termLabel}</span>
          </div>

          <ColorPicker label={`Color for ${code}`} value={entry.colorIndex} onChange={(index) => onColor(entry, index)} />

          {conflicts.length > 0 ? (
            <p className={styles.notice} data-tone="danger">
              <strong>Overlaps {conflicts.map((c) => c.other).join(" and ")}</strong> ({conflicts.map((c) => c.conflict.label).join("; ")}).
              Both stay on your schedule; GoSolar enforces real conflicts at registration.
            </p>
          ) : null}
          {resolution?.status === "missing" ? (
            <p className={styles.notice} data-tone="warning">
              GoSolar doesn&rsquo;t list CRN {entry.crn} for this term anymore. It may have been cancelled or renumbered.
            </p>
          ) : null}
          {resolution?.status === "failed" ? (
            <p className={styles.notice} data-tone="warning">
              Couldn&rsquo;t load meeting times from GoSolar. Try again from the schedule page.
            </p>
          ) : null}

          {section ? (
            <div className={styles.section}>
              <h3 className={styles.heading}>Meetings</h3>
              {meetings.length === 0 ? (
                <p className={styles.muted}>Online or to be announced: no set meeting time.</p>
              ) : (
                <ul className={styles.meetings}>
                  {meetings.map((meeting, index) => (
                    <li key={index} className={styles.meeting}>
                      <span className={styles.days}>{meeting.days.map((day) => DAY_LABELS[day].short).join(", ")}</span>
                      <span>{timeLabel(meeting.start, meeting.end)}</span>
                      <span className={styles.muted}>
                        {meetingLocation(meeting.meetingTime.buildingDescription, meeting.meetingTime.room) ?? "Room TBA"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {instructor || seats ? (
                <p className={styles.muted}>
                  {instructor ? <>Instructor: {instructor}</> : null}
                  {instructor && seats ? " · " : null}
                  {seats}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
