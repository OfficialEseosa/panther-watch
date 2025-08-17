import './CourseResults.css'
import { formatTime, getEnrollmentStatus, formatCreditHours, getWaitlistStatus } from '../../utils'
import { renderDaysOfWeek } from '../../utils/scheduleComponents'
import LoadingBar from '../LoadingBar'

function CourseResults({ courses, loading, error }) {
  if (error) {
    return (
      <div className="error-message">
        {error}
      </div>
    );
  }

  if (loading) {
    return <LoadingBar message="Searching for courses..." />
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <div className="results-section">
      <div className="results-header">
        <div className="results-count">
          Found {courses.length} course{courses.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="courses-grid">
        {courses.map((course) => (
          <div key={course.courseReferenceNumber} className="course-card">
            <div className="course-header">
              <h3 className="course-title">
                {course.subjectDescription} ({course.subject} {course.courseNumber})
              </h3>
              <span className="course-crn">CRN: {course.courseReferenceNumber}</span>
            </div>
            
            <div className="course-body">
              <div className="course-info">
                <div className="info-item">
                  <span className="info-label">Course Title</span>
                  <span className="info-value">{course.courseTitle}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Section</span>
                  <span className="info-value">{course.sequenceNumber}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Credits</span>
                  <span className="info-value">{formatCreditHours(course.creditHourLow, course.creditHourHigh)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Schedule Type</span>
                  <span className="info-value">{course.scheduleTypeDescription}</span>
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
                  const waitlistInfo = getWaitlistStatus(course.waitAvailable, course.waitCapacity);
                  if (waitlistInfo.hasWaitlist) {
                    return (
                      <>
                        <div className="enrollment-item waitlist-item">
                          <span className={`enrollment-number waitlist-number ${waitlistInfo.statusClass}`}>
                            {course.waitAvailable}
                          </span>
                          <span className="enrollment-label">Waitlist Available</span>
                        </div>
                        <div className="enrollment-item waitlist-item">
                          <span className="enrollment-number waitlist-number">{course.waitCapacity}</span>
                          <span className="enrollment-label">Waitlist Capacity</span>
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
                        <span className="location-building">{meeting.meetingTime.buildingDescription}</span>
                        {meeting.meetingTime.room && ` - Room ${meeting.meetingTime.room}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CourseResults;
