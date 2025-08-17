/**
 * Schedule utilities for course schedules (pure JS functions only)
 */
import { DAYS_OF_WEEK } from './timeUtils';

/**
 * Gets active days from a meeting time object
 * @param {Object} meetingTime - Meeting time object
 * @returns {string[]} Array of active day names
 */
export const getActiveDays = (meetingTime) => {
  return DAYS_OF_WEEK
    .filter(day => meetingTime[day.key])
    .map(day => day.key);
};

/**
 * Formats active days as a readable string
 * @param {Object} meetingTime - Meeting time object
 * @returns {string} Formatted days string (e.g., "Mon, Wed, Fri")
 */
export const formatActiveDays = (meetingTime) => {
  const dayNames = {
    sunday: 'Sun',
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat'
  };

  return getActiveDays(meetingTime)
    .map(day => dayNames[day])
    .join(', ');
};

/**
 * Gets day data for rendering (returns data, not JSX)
 * @param {Object} meetingTime - Meeting time object with day boolean properties
 * @returns {Array} Array of day objects with key, label, and active status
 */
export const getDayData = (meetingTime) => {
  return DAYS_OF_WEEK.map(day => ({
    key: day.key,
    label: day.label,
    isActive: meetingTime[day.key]
  }));
};
