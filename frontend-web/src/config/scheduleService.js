import { buildApiUrl } from './index.js';

/**
 * Schedule Service - Manages user schedule persistence with hybrid localStorage + database approach
 * 
 * Data flow:
 * 1. localStorage stores full course objects: { "202601": [{ course details }] }
 * 2. Database stores only CRNs: { "202601": ["12345", "67890"] }
 * 3. When adding/removing, update both localStorage (full object) and database (CRN only)
 */

const STORAGE_KEY = 'pantherwatch.schedule.v1';

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
 * Add a course to user's schedule in database (CRN only)
 */
export const addCourse = async (termCode, crn) => {
  try {
    const response = await fetch(buildApiUrl('/schedule'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ termCode, crn })
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
      headers: {
        'Accept': 'application/json'
      }
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
