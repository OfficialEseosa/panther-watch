// Time-conflict detection between a candidate course and the courses already
// on the schedule for the same term.

import {
  parseTimeToMinutes,
  formatMinutesToLabel,
  getMeetingDays
} from '../pages/ScheduleBuilder/utils.js';

const parseMeetingDate = (dateStr) => {
  if (!dateStr) return null;
  const [month, day, year] = dateStr.split('/').map(Number);
  if (!month || !day || !year) return null;
  return new Date(year, month - 1, day).getTime();
};

// Meetings with known, non-overlapping date ranges (e.g. first-half vs
// second-half sessions) can share a time slot. Unknown dates assume overlap.
const dateRangesOverlap = (a, b) => {
  const aStart = parseMeetingDate(a.startDate);
  const aEnd = parseMeetingDate(a.endDate);
  const bStart = parseMeetingDate(b.startDate);
  const bEnd = parseMeetingDate(b.endDate);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return true;
  }
  return aStart <= bEnd && bStart <= aEnd;
};

const meetingsOfCourse = (course) =>
  (course?.meetingsFaculty || [])
    .map((meeting) => meeting?.meetingTime)
    .filter(Boolean)
    .map((meetingTime) => ({
      meetingTime,
      days: getMeetingDays(meetingTime),
      start: parseTimeToMinutes(meetingTime.beginTime),
      end: parseTimeToMinutes(meetingTime.endTime)
    }))
    .filter((m) => m.days.length > 0 && m.start !== null && m.end !== null);

/**
 * Returns every scheduled course that overlaps the candidate in time (one
 * entry per clashing course, with a human-readable label of the first clashing
 * meeting). Empty array when the candidate fits.
 */
export function findScheduleConflicts(candidate, scheduledCourses) {
  const candidateMeetings = meetingsOfCourse(candidate);
  if (candidateMeetings.length === 0) return [];

  const conflicts = [];

  for (const scheduled of scheduledCourses || []) {
    if (scheduled.courseReferenceNumber === candidate.courseReferenceNumber) {
      continue;
    }
    let found = null;
    for (const existing of meetingsOfCourse(scheduled)) {
      for (const incoming of candidateMeetings) {
        const sharedDay = incoming.days.find((day) => existing.days.includes(day));
        if (!sharedDay) continue;
        const timesOverlap = incoming.start < existing.end && existing.start < incoming.end;
        if (!timesOverlap) continue;
        if (!dateRangesOverlap(incoming.meetingTime, existing.meetingTime)) continue;

        found = {
          course: scheduled,
          courseCode: `${scheduled.subject} ${scheduled.courseNumber}`,
          crn: scheduled.courseReferenceNumber,
          day: sharedDay,
          timeLabel: `${formatMinutesToLabel(existing.start)} - ${formatMinutesToLabel(existing.end)}`
        };
        break;
      }
      if (found) break;
    }
    if (found) {
      conflicts.push(found);
    }
  }

  return conflicts;
}
