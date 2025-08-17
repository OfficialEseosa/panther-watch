/**
 * Schedule component helpers for JSX rendering
 */
import { getDayData } from './scheduleUtils';

/**
 * Renders days of the week indicators for a meeting time
 * @param {Object} meetingTime - Meeting time object with day boolean properties
 * @returns {JSX.Element[]} Array of day indicator elements
 */
export const renderDaysOfWeek = (meetingTime) => {
  const dayData = getDayData(meetingTime);
  
  return dayData.map(day => (
    <span
      key={day.key}
      className={`day-indicator ${day.isActive ? 'day-active' : ''}`}
    >
      {day.label}
    </span>
  ));
};
