/**
 * Time formatting utilities for course scheduling
 */

/**
 * Converts 24-hour time format (HHMM) to 12-hour format with AM/PM
 * @param {string} time - Time in HHMM format (e.g., "1430")
 * @returns {string} Time in 12-hour format (e.g., "2:30 PM")
 */
export const formatTime = (time) => {
  if (!time || time.length !== 4) return time;
  
  const hours = parseInt(time.substring(0, 2));
  const minutes = time.substring(2, 4);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  
  return `${displayHours}:${minutes} ${ampm}`;
};

/**
 * Days of the week configuration for schedule display
 */
export const DAYS_OF_WEEK = [
  { key: 'sunday', label: 'S' },
  { key: 'monday', label: 'M' },
  { key: 'tuesday', label: 'T' },
  { key: 'wednesday', label: 'W' },
  { key: 'thursday', label: 'T' },
  { key: 'friday', label: 'F' },
  { key: 'saturday', label: 'S' }
];
