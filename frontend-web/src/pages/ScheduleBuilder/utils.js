// Utility helpers for the Schedule Builder page. Keep these pure and shared.

import { isViewOnlyTerm } from '../../utils/termUtils.js';
import { icsColorName } from '../../utils/scheduleColors.js';

export { isViewOnlyTerm };

// Calendar ordering for every possible meeting day. Weekend columns are only
// shown when a class actually meets then (see useSchedulePlanner).
export const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

export const DAYS = WEEK_DAYS.slice(0, 5);

const ICS_DAY_MAP = {
  Sunday: 'SU',
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA'
};

const DAY_ABBREVIATIONS = {
  Sunday: 'Sun',
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat'
};

export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const numeric = timeStr.toString().replace(/[^0-9]/g, '');
  if (numeric.length === 0) return null;
  const padded = numeric.padStart(4, '0');
  const hours = parseInt(padded.slice(0, 2), 10);
  const minutes = parseInt(padded.slice(2, 4), 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

export const formatMinutesToLabel = (minutes) => {
  if (minutes === null || minutes === undefined) return '';
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${mins.toString().padStart(2, '0')} ${period}`;
};

const formatTimeForICS = (timeStr) => {
  const numeric = timeStr?.toString().replace(/[^0-9]/g, '');
  if (!numeric) return null;
  const padded = numeric.padStart(4, '0');
  return `${padded.slice(0, 2)}${padded.slice(2)}00`;
};

const sanitizeDateForICS = (dateStr) => {
  if (!dateStr) return null;

  const [month, day, year] = dateStr.split('/');
  return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
};

// Every day this meeting occurs on, in calendar order (including weekends;
// the GoSolar meeting object has a boolean per lowercase day name).
export const getMeetingDays = (meetingTime) => {
  if (!meetingTime) return [];
  return WEEK_DAYS.filter((label) => meetingTime[label.toLowerCase()]);
};

export const getInstructorNames = (course) => {
  if (!Array.isArray(course?.faculty) || course.faculty.length === 0) {
    return 'TBA';
  }
  return course.faculty
    .map((facultyMember) => facultyMember?.displayName)
    .filter(Boolean)
    .join(', ');
};

const generateEventUid = (course, index) =>
  `${course.courseReferenceNumber}-${course.term || 'term'}-${index}@pantherwatch.app`;

const formatICSDescription = (course) => {
  const details = [
    `CRN: ${course.courseReferenceNumber}`,
    `Instructor: ${getInstructorNames(course)}`,
    `Term: ${course.termDesc || course.term || 'TBA'}`
  ];
  return details.join('\\n');
};

export const generateICSFile = (courses) => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

  let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//PantherWatch//Class Schedule//EN\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n';

  courses.forEach((course) => {
    const meetings = course?.meetingsFaculty || [];
    meetings.forEach((meeting, index) => {
      const meetingTime = meeting?.meetingTime;
      if (!meetingTime) return;

      const days = getMeetingDays(meetingTime);
      const byDay = days
        .map((day) => ICS_DAY_MAP[day])
        .filter(Boolean)
        .join(',');

      const startDate = sanitizeDateForICS(meetingTime.startDate);
      const endDate = sanitizeDateForICS(meetingTime.endDate);
      const startTime = formatTimeForICS(meetingTime.beginTime);
      const endTime = formatTimeForICS(meetingTime.endTime);

      if (!startDate || !startTime || !byDay) {
        return;
      }

      const locationParts = [];
      if (meetingTime.buildingDescription) {
        locationParts.push(meetingTime.buildingDescription);
      }
      if (meetingTime.room) {
        locationParts.push(`Room ${meetingTime.room}`);
      }
      const location = locationParts.join(' - ') || 'TBA';

      icsContent += 'BEGIN:VEVENT\n';
      icsContent += `UID:${generateEventUid(course, index)}\n`;
      icsContent += `DTSTAMP:${timestamp}\n`;
      icsContent += `SUMMARY:${course.courseTitle} - ${course.subject} ${course.courseNumber}\n`;
      icsContent += `DESCRIPTION:${formatICSDescription(course)}\n`;
      icsContent += `LOCATION:${location}\n`;
      // RFC 7986 event color. Best effort: most calendar apps (Google, Apple)
      // ignore it on import and use the target calendar's color instead.
      const colorName = icsColorName(course.scheduleColor);
      if (colorName) {
        icsContent += `COLOR:${colorName}\n`;
      }
      icsContent += `DTSTART:${startDate}T${startTime}\n`;
      if (endTime) {
        icsContent += `DTEND:${startDate}T${endTime}\n`;
      }
      if (endDate && byDay) {
        icsContent += `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${endDate}T235959\n`;
      } else if (byDay) {
        icsContent += `RRULE:FREQ=WEEKLY;BYDAY=${byDay}\n`;
      }
      icsContent += 'END:VEVENT\n';
    });
  });

  icsContent += 'END:VCALENDAR';
  return icsContent;
};

export const buildMeetingSummaries = (course) => {
  const meetings = course?.meetingsFaculty || [];
  const summaries = [];

  meetings.forEach((meeting, index) => {
    const meetingTime = meeting?.meetingTime;
    if (!meetingTime) return;

    const days = getMeetingDays(meetingTime);
    if (!days.length) return;

    const startMinutes = parseTimeToMinutes(meetingTime.beginTime);
    const endMinutes = parseTimeToMinutes(meetingTime.endTime);

    const dayLabel = days
      .map((day) => DAY_ABBREVIATIONS[day] || day.slice(0, 3))
      .join(', ');

    const timeLabel =
      startMinutes !== null && endMinutes !== null
        ? `${formatMinutesToLabel(startMinutes)} - ${formatMinutesToLabel(endMinutes)}`
        : 'Time TBA';

    const locationParts = [];
    if (meetingTime.buildingDescription) {
      locationParts.push(meetingTime.buildingDescription);
    }
    if (meetingTime.room) {
      locationParts.push(`Room ${meetingTime.room}`);
    }
    const location = locationParts.join(' - ') || 'Location TBA';

    summaries.push({
      id: `${course.courseReferenceNumber}-${index}`,
      dayLabel,
      timeLabel,
      location
    });
  });

  if (!summaries.length) {
    summaries.push({
      id: `${course.courseReferenceNumber}-tba`,
      dayLabel: 'Schedule TBA',
      timeLabel: '',
      location: ''
    });
  }

  return summaries;
};
