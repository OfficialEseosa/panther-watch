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
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  return `${displayHours}:${minutes} ${ampm}`;
};

/**
 * Days of the week configuration for schedule display
 */
export const DAYS_OF_WEEK = [
  { key: 'sunday', label: 'Sun' },
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Th' },
  { key: 'friday', label: 'Fr' },
  { key: 'saturday', label: 'Sat' }
];

/**
 * Maps term codes to human-readable names
 * @param {string} termCode - Term code (e.g., "202508")
 * @returns {string} Human-readable term name
 */
export const getTermName = (termCode) => {
  const termMap = {
    '202508': 'Fall Semester 2025',
    '202501': 'Spring Semester 2025',
    '202505': 'Summer Semester 2025',
    '202408': 'Fall Semester 2024',
    '202401': 'Spring Semester 2024',
    '202405': 'Summer Semester 2024',
  };
  
  return termMap[termCode] || termCode;
};
