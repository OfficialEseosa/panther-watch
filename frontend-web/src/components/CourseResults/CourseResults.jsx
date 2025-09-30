import { useState } from 'react';
import Icon from '../Icon';
import './CourseResults.css';
import { formatTime, getEnrollmentStatus, formatCreditHours, getWaitlistStatus } from '../../utils';
import { renderDaysOfWeek } from '../../utils/scheduleComponents';
import { useWatchedClasses } from '../../contexts/WatchedClassesContext';
import { useTerms } from '../../contexts/TermsContext';
import LoadingBar from '../LoadingBar';

function CourseResults({ courses, loading, error, selectedTerm, isTrackedView = false, onCourseRemoved, watchedCrns = [] }) {
  const [watchingStatus, setWatchingStatus] = useState({});
  const [watchLoading, setWatchLoading] = useState({});
  const { getTermName: getTermNameFromContext } = useTerms();
  const { addWatchedClass, removeWatchedClass } = useWatchedClasses();

  const handleWatchToggle = async (course) => {
    const crn = course.courseReferenceNumber;
    const courseTerm = course.term || selectedTerm;
    const key = `${crn}-${courseTerm}`;

    try {
      setWatchLoading((prev) => ({ ...prev, [key]: true }));

      const isCurrentlyWatching = watchingStatus[key] || isTrackedView;

      if (isCurrentlyWatching || isTrackedView) {
        await removeWatchedClass(crn, courseTerm);
        setWatchingStatus((prev) => ({ ...prev, [key]: false }));

        if (isTrackedView && onCourseRemoved) {
          onCourseRemoved(course);
        }
      } else {
        const watchData = {
          crn,
          term: courseTerm,
          courseTitle: course.courseTitle,
          courseNumber: course.courseNumber,
          subject: course.subject,
          instructor: course.faculty?.[0]?.displayName || 'TBA'
        };

        await addWatchedClass(watchData);
        setWatchingStatus((prev) => ({ ...prev, [key]: true }));
      }
    } catch (err) {
      console.error('Failed to toggle watch status:', err);
    } finally {
      setWatchLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const renderWatchButtonContent = (isWatchLoading, isTrackedView, isWatching) => {
    if (isWatchLoading) {
      return 'Saving...';
    }

    if (isTrackedView) {
      return (
        <>
          <Icon name="remove" size={18} aria-hidden />
          Remove
        </>
      );
    }

    if (isWatching) {
      return (
        <>
          <Icon name="watching" size={18} aria-hidden />
          Watching
        </>
      );
    }

    return (
      <>
        <Icon name="watch" size={18} aria-hidden />
        Watch
      </>
    );
  };

  if (error) {
    return (
      <div className="error-message">
        {error}
      </div>
    );
  }

  if (loading) {
    return <LoadingBar message="Searching for courses..." />;
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <div className="results-section">
      <div className="results-header" aria-live="polite">
        <div className="results-count">
          Found {courses.length} course{courses.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="courses-grid">
        {courses.map((course) => {
          const crn = course.courseReferenceNumber;
          const courseTerm = course.term || selectedTerm;
          const key = `${crn}-${courseTerm}`;
          const isWatchingFromState = watchingStatus[key];
          const isWatchingFromProps = watchedCrns.includes(crn);
          const isWatching = isWatchingFromState !== undefined ? isWatchingFromState : isWatchingFromProps;
          const isWatchLoading = watchLoading[key];

          return (
            <article key={course.courseReferenceNumber} className="course-card">
              <header className="course-header">
                <div className="course-title-section">
                  <h3 className="course-title">
                    {course.subjectDescription} ({course.subject} {course.courseNumber})
                  </h3>
                  <span className="course-crn">CRN {course.courseReferenceNumber}</span>
                </div>
                <button
                  type="button"
                  className={`watch-button ${isTrackedView ? 'state-remove' : isWatching ? 'state-active' : ''}`}
                  onClick={() => handleWatchToggle(course)}
                  disabled={isWatchLoading}
                >
                  {renderWatchButtonContent(isWatchLoading, isTrackedView, isWatching)}
                </button>
              </header>

              <div className="course-body">
                <div className="course-info">
                  <div className="info-item">
                    <span className="info-label">Course title</span>
                    <span className="info-value">{course.courseTitle}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Section</span>
                    <span className="info-value">{course.sequenceNumber}</span>
                  </div>
                  {isTrackedView && course.term && (
                    <div className="info-item">
                      <span className="info-label">Term</span>
                      <span className="info-value">{getTermNameFromContext(course.term)}</span>
                    </div>
                  )}
                  <div className="info-item">
                    <span className="info-label">Credits</span>
                    <span className="info-value">{formatCreditHours(course.creditHourLow, course.creditHourHigh)}</span>
                  </div>
                </div>

                <div className="enrollment-status">
                  <div className="enrollment-item">
                    <span className={`enrollment-number ${getEnrollmentStatus(course.seatsAvailable, course.maximumEnrollment)}`}>
                      {course.seatsAvailable}
                    </span>
                    <span className="enrollment-label">Available</span>
                  </div>
                  <div className="enrollment-item">
                    <span className="enrollment-number">{course.enrollment}</span>
                    <span className="enrollment-label">Enrolled</span>
                  </div>
                  <div className="enrollment-item">
                    <span className="enrollment-number">{course.maximumEnrollment}</span>
                    <span className="enrollment-label">Capacity</span>
                  </div>
                  {(() => {
                    const waitAvailable = course.waitAvailable;
                    const waitCapacity = course.waitCapacity;
                    const waitCount = course.waitCount;
                    const waitlistInfo = getWaitlistStatus(waitAvailable, waitCapacity);
                    if (waitlistInfo.hasWaitlist) {
                      return (
                        <>
                          <div className="enrollment-item waitlist-item">
                            <span className={`enrollment-number waitlist-number ${waitlistInfo.statusClass}`}>
                              {waitCount ?? 'N/A'}
                            </span>
                            <span className="enrollment-label">Waitlist count</span>
                          </div>
                          <div className="enrollment-item waitlist-item">
                            <span className="enrollment-number waitlist-number">{waitCapacity ?? 'N/A'}</span>
                            <span className="enrollment-label">Waitlist capacity</span>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>

                {course.faculty && course.faculty.length > 0 && (
                  <div className="faculty-section">
                    <div className="faculty-title">Instructor</div>
                    {course.faculty.map((faculty, index) => (
                      <div key={index} className="faculty-name">
                        {faculty.displayName}
                      </div>
                    ))}
                  </div>
                )}

                {course.meetingsFaculty && course.meetingsFaculty.length > 0 && (
                  <div className="meeting-times">
                    {course.meetingsFaculty.map((meeting, index) => (
                      <div key={index} className="meeting-time">
                        <div className="time-schedule">
                          <span className="time-range">
                            {formatTime(meeting.meetingTime.beginTime)} - {formatTime(meeting.meetingTime.endTime)}
                          </span>
                          <div className="days-week">
                            {renderDaysOfWeek(meeting.meetingTime)}
                          </div>
                        </div>
                        <div className="location-info">
                          <span className="location-building">{meeting.meetingTime.buildingDescription || 'Location TBA'}</span>
                          {meeting.meetingTime.room && ` - Room ${meeting.meetingTime.room}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default CourseResults;
