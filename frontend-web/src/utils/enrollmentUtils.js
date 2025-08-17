/**
 * Enrollment status utilities for course availability
 */

/**
 * Determines the enrollment status CSS class based on available seats
 * @param {number} available - Number of available seats
 * @param {number} total - Total capacity
 * @returns {string} CSS class name for styling
 */
export const getEnrollmentStatus = (available, total) => {
  if (available === 0) return 'seats-full';
  if (available <= total * 0.2) return 'seats-low';
  return 'seats-available';
};

/**
 * Calculates enrollment percentage
 * @param {number} enrolled - Number of enrolled students
 * @param {number} capacity - Maximum capacity
 * @returns {number} Percentage enrolled (0-100)
 */
export const getEnrollmentPercentage = (enrolled, capacity) => {
  if (capacity === 0) return 0;
  return Math.round((enrolled / capacity) * 100);
};

/**
 * Gets a human-readable enrollment status message
 * @param {number} available - Number of available seats
 * @param {number} total - Total capacity
 * @returns {string} Status message
 */
export const getEnrollmentMessage = (available, total) => {
  if (available === 0) return 'Full';
  if (available <= total * 0.2) return 'Almost Full';
  if (available >= total * 0.8) return 'Many Available';
  return 'Available';
};

/**
 * Format credit hours display
 * @param {number} creditHourLow - Minimum credit hours
 * @param {number} creditHourHigh - Maximum credit hours
 * @returns {string} Formatted credit hours
 */
export const formatCreditHours = (creditHourLow, creditHourHigh) => {
  // If creditHourHigh is 0 or same as low, show only the low value
  if (creditHourHigh === 0 || creditHourLow === creditHourHigh) {
    return creditHourLow.toString();
  }
  // Otherwise show the range
  return `${creditHourLow} - ${creditHourHigh}`;
};

/**
 * Get waitlist status information
 * @param {number} waitAvailable - Available waitlist spots
 * @param {number} waitCapacity - Total waitlist capacity
 * @returns {Object} Waitlist status object
 */
export const getWaitlistStatus = (waitAvailable, waitCapacity) => {
  if (!waitCapacity || waitCapacity === 0) {
    return {
      hasWaitlist: false,
      status: 'No Waitlist',
      statusClass: 'no-waitlist'
    };
  }
  
  const waitlistUsed = waitCapacity - waitAvailable;
  
  if (waitAvailable === 0) {
    return {
      hasWaitlist: true,
      status: 'Waitlist Full',
      statusClass: 'waitlist-full',
      available: waitAvailable,
      capacity: waitCapacity,
      used: waitlistUsed
    };
  } else if (waitAvailable <= waitCapacity * 0.2) {
    return {
      hasWaitlist: true,
      status: 'Waitlist Nearly Full',
      statusClass: 'waitlist-low',
      available: waitAvailable,
      capacity: waitCapacity,
      used: waitlistUsed
    };
  } else {
    return {
      hasWaitlist: true,
      status: 'Waitlist Available',
      statusClass: 'waitlist-available',
      available: waitAvailable,
      capacity: waitCapacity,
      used: waitlistUsed
    };
  }
};
