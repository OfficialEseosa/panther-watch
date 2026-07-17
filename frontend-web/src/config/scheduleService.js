import { buildApiUrl } from './index.js';
import { authService } from './authService.js';

/**
 * Schedule Service - Manages user schedule persistence with hybrid localStorage + database approach
 *
 * Data flow:
 * 1. localStorage stores full course objects: { "202601": [{ course details }] }
 * 2. Database stores CRN + course identity: { "202601": [{ crn, subject, courseNumber, courseTitle }] }
 * 3. When adding/removing, update both localStorage (full object) and database (identity only)
 * 4. On sign-in, the database is fetched and entries missing locally are hydrated
 *    back into full course objects via a subject+courseNumber search (so the
 *    schedule follows the account across devices, not just this browser)
 */

const STORAGE_KEY = 'pantherwatch.schedule.v1';

const authHeaders = async () => {
  const token = await authService.getAccessToken();
  return {
    Accept: 'application/json',
    Authorization: token ? `Bearer ${token}` : ''
  };
};

/**
 * Load schedule from localStorage (full course objects)
 */
export const loadFromLocalStorage = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Failed to read schedule from localStorage:', error);
    return {};
  }
};

/**
 * Save schedule to localStorage (full course objects)
 */
export const saveToLocalStorage = (scheduleByTerm) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduleByTerm));
  } catch (error) {
    console.error('Failed to save schedule to localStorage:', error);
  }
};

/**
 * Fetch the account's schedule from the database.
 * Returns { termCode: [{ crn, subject, courseNumber, courseTitle }, ...] }.
 */
export const fetchScheduleEntries = async () => {
  const response = await fetch(buildApiUrl('/schedule'), {
    credentials: 'include',
    headers: await authHeaders()
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schedule: ${response.status}`);
  }

  const byTerm = await response.json();
  const entriesByTerm = {};
  Object.entries(byTerm || {}).forEach(([termCode, entries]) => {
    entriesByTerm[termCode] = (entries || []).filter((entry) => entry?.crn);
  });
  return entriesByTerm;
};

/**
 * Fetch all sections of one course (subject + courseNumber) in one term.
 * Used to hydrate schedule entries back into full course objects; the caller
 * picks the section matching its CRN.
 */
export const fetchCourseSections = async (termCode, subject, courseNumber) => {
  const params = new URLSearchParams({
    txtTerm: termCode,
    txtSubject: subject,
    txtCourseNumber: courseNumber,
    pageOffset: 0,
    pageMaxSize: 50
  });

  const response = await fetch(`${buildApiUrl('/courses/search')}?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${subject} ${courseNumber}: ${response.status}`);
  }

  const payload = await response.json();
  const sections = Array.isArray(payload?.data) ? payload.data : [];
  return sections.map((course) => ({ ...course, term: termCode }));
};

/**
 * Add a course to user's schedule in database (CRN plus course identity, so
 * other devices can hydrate the entry without a stored copy of the course)
 */
export const addCourse = async (termCode, course) => {
  try {
    const response = await fetch(buildApiUrl('/schedule'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders())
      },
      body: JSON.stringify({
        termCode,
        crn: course.courseReferenceNumber,
        subject: course.subject,
        courseNumber: course.courseNumber,
        courseTitle: course.courseTitle
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to add course: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error adding course to schedule:', error);
    throw error;
  }
};

/**
 * Remove a course from user's schedule in database
 */
export const removeCourse = async (termCode, crn) => {
  try {
    const response = await fetch(buildApiUrl(`/schedule/${termCode}/${crn}`), {
      method: 'DELETE',
      credentials: 'include',
      headers: await authHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to remove course: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error removing course from schedule:', error);
    throw error;
  }
};
