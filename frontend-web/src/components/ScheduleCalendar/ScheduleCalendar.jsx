import { useState, useRef, useEffect } from 'react';
import Icon from '../Icon';
import { decodeHtmlEntities } from '../../utils';

function ScheduleCalendar({ days, timeSlots, getClassesForSlot, onRemove, formatMinutesToLabel }) {
  const [selectedClass, setSelectedClass] = useState(null);
  const calendarViewRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Preserve scroll position on resize
  useEffect(() => {
    const calendarView = calendarViewRef.current;
    if (!calendarView) return;

    const handleScroll = () => {
      scrollPositionRef.current = calendarView.scrollTop;
    };

    const handleResize = () => {
      // Restore scroll position after resize
      if (calendarView && scrollPositionRef.current > 0) {
        requestAnimationFrame(() => {
          calendarView.scrollTop = scrollPositionRef.current;
        });
      }
    };

    calendarView.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);

    return () => {
      calendarView.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleClassClick = (classBlock) => {
    setSelectedClass(classBlock);
  };

  const closeModal = () => {
    setSelectedClass(null);
  };

  return (
    <>
      <div className="calendar-view" ref={calendarViewRef}>
        <div className="calendar-grid">
          <div className="time-column">
            <div className="time-header"></div>
            {timeSlots.map((slot) => (
              <div key={slot.label} className="time-slot-label">
                {slot.label}
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div key={day} className="day-column">
              <div className="day-header">{day}</div>
              {timeSlots.map((slot) => {
                const classesInSlot = getClassesForSlot(day, slot.startMinutes);
                return (
                  <div key={`${day}-${slot.label}`} className="time-slot">
                    {classesInSlot.map((classBlock) => {
                      // Calculate position and height based on actual start/end times
                      const slotHeight = 80; // Height of one time slot in pixels
                      const minutesFromSlotStart = classBlock.startMinutes - slot.startMinutes;
                      const topPosition = (minutesFromSlotStart / 60) * slotHeight;
                      const durationMinutes = classBlock.endMinutes - classBlock.startMinutes;
                      const blockHeight = (durationMinutes / 60) * slotHeight;

                      return (
                        <div
                          key={classBlock.meetingId}
                          className="class-block"
                          style={{
                            position: 'absolute',
                            top: `${topPosition}px`,
                            height: `${blockHeight}px`,
                            left: '4px',
                            right: '4px',
                            margin: 0
                          }}
                          onClick={() => handleClassClick(classBlock)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleClassClick(classBlock);
                            }
                          }}
                        >
                          <div className="class-block-content">
                            <div className="class-code">{classBlock.courseCode}</div>
                            <div className="class-time">
                              {formatMinutesToLabel(classBlock.startMinutes)} -{' '}
                              {formatMinutesToLabel(classBlock.endMinutes)}
                            </div>
                            <div className="class-location">{classBlock.location}</div>
                            <button
                              className="remove-class-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRemove(classBlock.crn);
                              }}
                              title="Remove from schedule"
                            >
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Class Details Modal */}
      {selectedClass && (
        <div className="class-detail-modal-overlay" onClick={closeModal}>
          <div className="class-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="class-detail-header">
              <h3 className="class-detail-title">
                {selectedClass.courseCode}
              </h3>
              <button className="class-detail-close" onClick={closeModal}>
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="class-detail-body">
              <div className="class-detail-section">
                <span className="class-detail-label">Course Title</span>
                <span className="class-detail-value">{decodeHtmlEntities(selectedClass.courseTitle)}</span>
              </div>
              <div className="class-detail-section">
                <span className="class-detail-label">CRN</span>
                <span className="class-detail-value">{selectedClass.crn}</span>
              </div>
              <div className="class-detail-section">
                <span className="class-detail-label">Instructor</span>
                <span className="class-detail-value">{selectedClass.instructor || 'TBA'}</span>
              </div>
              <div className="class-detail-section">
                <span className="class-detail-label">Time</span>
                <span className="class-detail-value">
                  {formatMinutesToLabel(selectedClass.startMinutes)} - {formatMinutesToLabel(selectedClass.endMinutes)}
                </span>
              </div>
              <div className="class-detail-section">
                <span className="class-detail-label">Location</span>
                <span className="class-detail-value">{selectedClass.location || 'TBA'}</span>
              </div>
              {selectedClass.credits && (
                <div className="class-detail-section">
                  <span className="class-detail-label">Credits</span>
                  <span className="class-detail-value">{selectedClass.credits}</span>
                </div>
              )}
            </div>
            <div className="class-detail-footer">
              <button
                className="class-detail-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(selectedClass.crn);
                  closeModal();
                }}
              >
                <Icon name="trash" size={16} />
                Remove from schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ScheduleCalendar;
