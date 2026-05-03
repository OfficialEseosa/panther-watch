import { useState } from 'react';
import Icon from '../Icon';
import './CourseResults.css';
import { formatTime, decodeHtmlEntities } from '../../utils';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import { useTerms } from '../../hooks/useTerms.js';
import LoadingBar from '../LoadingBar';

/* ── Day pills helper ─────────────────────────────────────── */
const DAY_KEYS = [
  { key: 'monday',    label: 'M' },
  { key: 'tuesday',   label: 'T' },
  { key: 'wednesday', label: 'W' },
  { key: 'thursday',  label: 'R' },
  { key: 'friday',    label: 'F' },
  { key: 'saturday',  label: 'S' },
];

function DayPills({ meetingTime }) {
  if (!meetingTime) return null;
  return (
    <span className="pw-day-pills">
      {DAY_KEYS.map(({ key, label }) => (
        <span
          key={key}
          className={`pw-day-pill ${meetingTime[key] ? 'on' : ''}`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/* ── Seat-status helpers ──────────────────────────────────── */
function seatColor(available, capacity) {
  if (available <= 0) return 'red';
  if (capacity > 0 && available / capacity < 0.1) return 'amber';
  return 'green';
}

function seatPct(available, capacity) {
  if (!capacity) return 0;
  const enrolled = Math.max(0, capacity - available);
  return Math.max(0, Math.min(100, (enrolled / capacity) * 100));
}

function StatusTag({ available, capacity }) {
  const color = seatColor(available, capacity);
  const label = color === 'red' ? 'Closed' : color === 'amber' ? 'Almost full' : 'Open';
  return (
    <span className={`pw-tag ${color}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

/* ── Main component ───────────────────────────────────────── */
function CourseResults({
  courses,
  loading,
  error,
  selectedTerm,
  isTrackedView = false,
  onCourseRemoved,
  watchedCrns = [],
}) {
  const [watchLoading, setWatchLoading] = useState({});
  const { getTermName } = useTerms();
  const { addWatchedClass, removeWatchedClass } = useWatchedClasses();

  const handleWatchToggle = async (course) => {
    const crn       = course.courseReferenceNumber;
    const courseTerm = course.term || selectedTerm;
    const key       = `${crn}-${courseTerm}`;

    try {
      setWatchLoading((prev) => ({ ...prev, [key]: true }));

      const isCurrentlyWatching = watchedCrns.includes(crn);

      if (isCurrentlyWatching || isTrackedView) {
        await removeWatchedClass(crn, courseTerm);
        if (isTrackedView && onCourseRemoved) onCourseRemoved(course);
      } else {
        await addWatchedClass({
          crn,
          term: courseTerm,
          courseTitle:  course.courseTitle,
          courseNumber: course.courseNumber,
          subject:      course.subject,
          instructor:   course.faculty?.[0]?.displayName || 'TBA',
        });
      }
    } catch (err) {
      console.error('Failed to toggle watch status:', err);
    } finally {
      setWatchLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  /* ── States ── */
  if (error) {
    return <div className="pw-course-error">{error}</div>;
  }

  if (loading) {
    return <LoadingBar message="Searching for courses..." />;
  }

  if (!courses || courses.length === 0) return null;

  return (
    <div className="pw-results-section">
      <div className="pw-results-header">
        <span className="pw-results-count">
          {courses.length} {courses.length === 1 ? 'section' : 'sections'} found
        </span>
      </div>

      <div className="pw-course-list">
        {courses.map((course) => {
          const crn        = course.courseReferenceNumber;
          const courseTerm = course.term || selectedTerm;
          const key        = `${crn}-${courseTerm}`;
          const isWatching = watchedCrns.includes(crn);
          const isBusy     = watchLoading[key];

          const available = course.seatsAvailable ?? 0;
          const capacity  = course.maximumEnrollment ?? 0;
          const enrolled  = course.enrollment ?? 0;
          const waitCount = course.waitCount ?? 0;
          const color     = seatColor(available, capacity);
          const pct       = seatPct(available, capacity);

          // Primary meeting (first one)
          const meeting = course.meetingsFaculty?.[0];
          const mt = meeting?.meetingTime;
          const timeStr = mt
            ? `${formatTime(mt.beginTime)} – ${formatTime(mt.endTime)}`
            : null;
          const location = mt?.buildingDescription
            ? `${mt.buildingDescription}${mt.room ? ` ${mt.room}` : ''}`
            : null;

          const instructor = course.faculty?.[0]?.displayName || 'TBA';

          return (
            <div
              key={crn}
              className={`pw-course-row ${isWatching || isTrackedView ? 'watching' : ''}`}
            >
              {/* ── Left: info ── */}
              <div className="pw-course-info">
                <div className="pw-course-meta-row">
                  <span className="pw-course-code">
                    {course.subject} {course.courseNumber}
                  </span>
                  <span className="pw-course-divider">·</span>
                  <span className="pw-course-crn">CRN {crn}</span>
                  {course.sequenceNumber && (
                    <>
                      <span className="pw-course-divider">·</span>
                      <span className="pw-course-section">§{course.sequenceNumber}</span>
                    </>
                  )}
                  <StatusTag available={available} capacity={capacity} />
                  {isTrackedView && course.term && (
                    <span className="pw-tag blue" style={{ marginLeft: 2 }}>
                      {getTermName(course.term)}
                    </span>
                  )}
                </div>

                <h3 className="pw-course-title">
                  {decodeHtmlEntities(course.courseTitle)}
                </h3>

                <div className="pw-course-detail-row">
                  {instructor !== 'TBA' && (
                    <span className="pw-course-detail">
                      <Icon name="user" size={13} aria-hidden />
                      {instructor}
                    </span>
                  )}
                  {mt && (
                    <span className="pw-course-detail">
                      <DayPills meetingTime={mt} />
                    </span>
                  )}
                  {timeStr && (
                    <span className="pw-course-detail">
                      <Icon name="clock" size={13} aria-hidden />
                      {timeStr}
                    </span>
                  )}
                  {location && (
                    <span className="pw-course-detail">
                      <Icon name="map" size={13} aria-hidden />
                      {location}
                    </span>
                  )}
                  {course.isPartialData && (
                    <span className="pw-partial-notice">
                      ⓘ Limited data
                    </span>
                  )}
                </div>
              </div>

              {/* ── Right: seat cluster ── */}
              <div
                className="pw-seat-cluster"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="pw-seat-readout">
                  <div className="pw-seat-readout-top">
                    <span className={`pw-seat-num ${color}`}>{available}</span>
                    <span className="pw-seat-of">/ {capacity} seats</span>
                  </div>
                  <div className="pw-seat-track">
                    <div className={`pw-seat-fill ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="pw-seat-meta">
                    <span><b>{enrolled}</b> enrolled</span>
                    {waitCount > 0 && (
                      <span><b>{waitCount}</b> waitlist</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Calendar shortcut */}
                  <button
                    type="button"
                    className="pw-cal-btn"
                    title="Add to schedule"
                    onClick={() =>
                      (window.location.href = `/schedule-builder?add=${crn}`)
                    }
                  >
                    <Icon name="calendar" size={13} aria-hidden />
                  </button>

                  {/* Watch / remove toggle */}
                  <button
                    type="button"
                    className={`pw-watch-toggle ${
                      isTrackedView ? 'remove' : isWatching ? 'watching' : ''
                    }`}
                    title={
                      isTrackedView
                        ? 'Remove from watchlist'
                        : isWatching
                        ? 'Stop watching'
                        : 'Watch this section'
                    }
                    onClick={() => handleWatchToggle(course)}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <Icon name="clock" size={14} aria-hidden />
                    ) : isTrackedView ? (
                      <Icon name="remove" size={14} aria-hidden />
                    ) : (
                      <Icon
                        name={isWatching ? 'bookmarkFilled' : 'bookmark'}
                        size={14}
                        aria-hidden
                      />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CourseResults;
