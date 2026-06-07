import { motion } from 'framer-motion';
import Icon from '../Icon';
import GradeBar from '../CourseGrades/GradeBar';
import { formatTime, getEnrollmentStatus, formatCreditHours, getWaitlistStatus, decodeHtmlEntities } from '../../utils';
import { renderDaysOfWeek } from '../../utils/scheduleComponents';
import { useCourseGrades } from '../../hooks/useCourseGrades.js';
import { useProfessorRatings } from '../../hooks/useProfessorRatings.js';
import { gpaTone, formatGpa } from '../CourseGrades/gradeUtils';
import { isExpiringSoon, formatExpiry } from '../../utils/trackedClassExpiry.js';
import rmpLogo from '../../assets/rmp.svg';
import '../CourseGrades/gradeStyles.css';

const MotionArticle = motion.article;

/**
 * Course card: keeps the full at-a-glance detail (enrollment, instructor,
 * meeting times) and a compact grade summary. The whole card is clickable and
 * morphs into the ExpandedCourseCard; only the action buttons stop that.
 */
function CourseCard({
  course,
  isTrackedView,
  isWatching,
  isWatchLoading,
  isGuest = false,
  onWatchToggle,
  onOpenDetails,
  getTermName,
}) {
  const crn = course.courseReferenceNumber;
  const instructor = course.faculty?.[0]?.displayName || 'TBA';
  const expiringSoon = isTrackedView && isExpiringSoon(course.term);

  const { grades } = useCourseGrades({
    subject: course.subject,
    courseNumber: course.courseNumber,
    instructor: instructor !== 'TBA' ? instructor : null,
  });

  const { rating } = useProfessorRatings({
    instructor: instructor !== 'TBA' ? instructor : null,
  });

  const featured = grades?.hasData
    ? (grades.instructorHasTaught && grades.instructorDistribution
        ? grades.instructorDistribution
        : grades.overall)
    : null;

  const openDetails = () => onOpenDetails({ course, grades, rating });

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetails();
    }
  };

  const stop = (event) => event.stopPropagation();

  const renderWatchContent = () => {
    if (isWatchLoading) return 'Saving…';
    if (isTrackedView) return (<><Icon name="remove" size={18} aria-hidden /> Remove</>);
    if (isWatching) return (<><Icon name="watching" size={18} aria-hidden /> Watching</>);
    return (<><Icon name="watch" size={18} aria-hidden /> Watch</>);
  };

  return (
    <MotionArticle
      layoutId={`course-${crn}`}
      className="course-card"
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={handleKeyDown}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      aria-label={`View details for ${course.subject} ${course.courseNumber}`}
    >
      <header className="course-header">
        <div className="course-title-section">
          <h3 className="course-title">
            {course.subjectDescription} ({course.subject} {course.courseNumber})
          </h3>
          <span className="course-crn">CRN {crn}</span>
        </div>
        <div className="course-actions">
          <button
            type="button"
            className="calendar-button"
            onClick={(e) => { stop(e); if (isGuest) return; window.location.href = `/schedule-builder?add=${crn}`; }}
            disabled={isGuest}
            title={isGuest ? 'Sign in to add to your schedule' : 'Add to schedule'}
          >
            <Icon name="calendar" size={18} aria-hidden />
          </button>
          <button
            type="button"
            className={`watch-button ${isTrackedView ? 'state-remove' : isWatching ? 'state-active' : ''}`}
            onClick={(e) => { stop(e); if (isGuest) return; onWatchToggle(course); }}
            disabled={isWatchLoading || isGuest}
            title={isGuest ? 'Sign in to track classes' : undefined}
          >
            {renderWatchContent()}
          </button>
        </div>
      </header>

      <div className="course-body">
        {expiringSoon && (
          <div className="expiry-notice" title={`Tracking ends ${formatExpiry(course.term)}`}>
            <Icon name="time" size={14} aria-hidden />
            <span className="expiry-notice-text">
              We&rsquo;ll stop tracking this on {formatExpiry(course.term)}
            </span>
          </div>
        )}
        <div className="course-info">
          <div className="info-item">
            <span className="info-label">Course title</span>
            <span className="info-value">{decodeHtmlEntities(course.courseTitle)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Section</span>
            <span className="info-value">{course.sequenceNumber}</span>
          </div>
          {isTrackedView && course.term && (
            <div className="info-item">
              <span className="info-label">Term</span>
              <span className="info-value">{getTermName(course.term)}</span>
            </div>
          )}
          <div className="info-item">
            <span className="info-label">Credits</span>
            <span className="info-value">{formatCreditHours(course.creditHourLow, course.creditHourHigh)}</span>
          </div>
        </div>

        {course.isPartialData && (
          <div className="partial-data-notice">
            <span className="partial-data-icon">ⓘ</span>
            <span className="partial-data-text">Limited enrollment data</span>
          </div>
        )}

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
            const waitlistInfo = getWaitlistStatus(course.waitAvailable, course.waitCapacity);
            if (waitlistInfo.hasWaitlist) {
              return (
                <>
                  <div className="enrollment-item waitlist-item">
                    <span className={`enrollment-number waitlist-number ${waitlistInfo.statusClass}`}>
                      {course.waitCount ?? 'N/A'}
                    </span>
                    <span className="enrollment-label">Waitlist count</span>
                  </div>
                  <div className="enrollment-item waitlist-item">
                    <span className="enrollment-number waitlist-number">{course.waitCapacity ?? 'N/A'}</span>
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
                <span className="faculty-name-text">{faculty.displayName}</span>
                {index === 0 && rating?.found && rating.avgRating != null && (
                  <span className="cc-rmp" title={`${rating.avgRating.toFixed(1)}/5 on Rate My Professors`}>
                    <img src={rmpLogo} alt="Rate My Professors" className="cc-rmp-logo" />
                    <span className="cc-rmp-score">{rating.avgRating.toFixed(1)}</span>
                  </span>
                )}
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

        {featured && (
          <div className="cc-grade-line">
            <div className={`cc-gpa gpa-tone-${gpaTone(featured.gpa)}`} title="Average GPA (grade history)">
              <span className="cc-gpa-num">{formatGpa(featured.gpa)}</span>
              <span className="cc-gpa-label">{grades.instructorHasTaught ? 'prof GPA' : 'avg GPA'}</span>
            </div>
            <GradeBar gradeCounts={featured.gradeCounts} height={8} />
          </div>
        )}
      </div>
    </MotionArticle>
  );
}

export default CourseCard;
