// Utility helpers for the Schedule Builder page. Keep these pure and shared.

const STORAGE_KEY = 'pantherwatch.schedule.v1';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const MEETING_DAY_LABELS = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday'
};

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

const formatHourLabel = (hour) => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
};

const createTimeSlots = (startHour = 8, endHour = 21) => {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    slots.push({
      label: formatHourLabel(hour),
      startMinutes: hour * 60
    });
  }
  return slots;
};

export const TIME_SLOTS = createTimeSlots();

export const loadScheduleFromStorage = () => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Failed to read schedule from storage:', error);
    return {};
  }
};

export const saveScheduleToStorage = (schedule) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  } catch (error) {
    console.warn('Failed to persist schedule:', error);
  }
};

export const isViewOnlyTerm = (term) =>
  typeof term?.description === 'string' &&
  term.description.toLowerCase().includes('view only');

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

export const getMeetingDays = (meetingTime) => {
  if (!meetingTime) return [];
  return Object.entries(MEETING_DAY_LABELS)
    .filter(([key]) => meetingTime[key])
    .map(([, label]) => label)
    .filter((label) => DAYS.includes(label));
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

  // Only show "Schedule TBA" for non-online courses
  if (!summaries.length && !isOnlineCourse(course)) {
    summaries.push({
      id: `${course.courseReferenceNumber}-tba`,
      dayLabel: 'Schedule TBA',
      timeLabel: '',
      location: ''
    });
  }

  // For online courses with no schedule, show "Asynchronous"
  if (!summaries.length && isOnlineCourse(course)) {
    summaries.push({
      id: `${course.courseReferenceNumber}-async`,
      dayLabel: 'Asynchronous',
      timeLabel: '',
      location: ''
    });
  }

  return summaries;
};

/**
 * Checks if a course is online based on campus description or building description
 * @param {Object} course - Course object
 * @returns {boolean} True if course is online
 */
export const isOnlineCourse = (course) => {
  // Check campusDescription
  if (course?.campusDescription && 
      course.campusDescription.toLowerCase().includes('online')) {
    return true;
  }

  // Check all meeting locations
  if (course?.meetingsFaculty && Array.isArray(course.meetingsFaculty)) {
    return course.meetingsFaculty.some(meeting => {
      const buildingDesc = meeting?.meetingTime?.buildingDescription;
      return buildingDesc && buildingDesc.toLowerCase().includes('online');
    });
  }

  return false;
};
