import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from '../Icon'
import GradeBar from '../CourseGrades/GradeBar'
import {
  FINE_GRADE_ORDER,
  gpaTone,
  dwfTone,
  formatGpa,
  formatPercent,
  semesterSpan,
  normalizeName,
} from '../CourseGrades/gradeUtils'
import {
  formatTime,
  getEnrollmentStatus,
  formatCreditHours,
  getWaitlistStatus,
  decodeHtmlEntities,
} from '../../utils'
import { renderDaysOfWeek } from '../../utils/scheduleComponents'
import './ExpandedCourseCard.css'

const MotionDiv = motion.div

// Shared spring for the card->modal morph and the active-tab indicator.
const MORPH = { type: 'spring', stiffness: 320, damping: 34 }

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'grades', label: 'Grade history', icon: 'analytics' },
  { id: 'ratings', label: 'Professor ratings', icon: 'people' },
  { id: 'syllabus', label: 'Syllabus', icon: 'bookmark' },
]

function EmptyState({ icon, title, text }) {
  return (
    <div className="exp-empty-state">
      <Icon name={icon} size={30} aria-hidden />
      <p className="exp-empty-title">{title}</p>
      {text && <p className="exp-empty-text">{text}</p>}
    </div>
  )
}

function MetricChip({ value, label, tone }) {
  return (
    <div className={`exp-metric ${tone || ''}`}>
      <span className="exp-metric-value">{value}</span>
      <span className="exp-metric-label">{label}</span>
    </div>
  )
}

/** Full distribution block for one aggregate (a professor or the whole course). */
function AggregateBlock({ aggregate, heading, subheading }) {
  if (!aggregate) return null
  const counts = aggregate.gradeCounts || {}

  return (
    <section className="exp-block">
      <div className="exp-block-head">
        <div className="exp-block-headings">
          <h3 className="exp-block-title">{heading}</h3>
          {aggregate.termsTaught?.length > 0 && (
            <span className="exp-block-span">{semesterSpan(aggregate.termsTaught)}</span>
          )}
        </div>
        {subheading && <span className="exp-block-sub">{subheading}</span>}
      </div>

      <div className="exp-metrics">
        <MetricChip value={formatGpa(aggregate.gpa)} label="Avg GPA" tone={`gpa-tone-${gpaTone(aggregate.gpa)}`} />
        <MetricChip value={formatPercent(aggregate.dwfPercent)} label="DWF rate" tone={`dwf-tone-${dwfTone(aggregate.dwfPercent)}`} />
        <MetricChip value={aggregate.total} label="Students" />
        <MetricChip value={aggregate.withdrawCount} label="Withdrawals" />
        <MetricChip value={aggregate.sectionsCount} label="Sections" />
      </div>

      <GradeBar gradeCounts={counts} showLabels height={12} />

      <div className="exp-fine-grid">
        {FINE_GRADE_ORDER.map((g) => (
          <div key={g} className="exp-fine-cell">
            <span className="exp-fine-grade">{g}</span>
            <span className="exp-fine-count">{counts[g] || 0}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function OverviewSection({ course }) {
  const waitlistInfo = getWaitlistStatus(course.waitAvailable, course.waitCapacity)

  return (
    <>
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
        {waitlistInfo.hasWaitlist && (
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
        )}
      </div>

      {course.faculty && course.faculty.length > 0 && (
        <div className="faculty-section">
          <div className="faculty-title">Instructor</div>
          {course.faculty.map((faculty, index) => (
            <div key={index} className="faculty-name">{faculty.displayName}</div>
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
                <div className="days-week">{renderDaysOfWeek(meeting.meetingTime)}</div>
              </div>
              <div className="location-info">
                <span className="location-building">{meeting.meetingTime.buildingDescription || 'Location TBA'}</span>
                {meeting.meetingTime.room && ` - Room ${meeting.meetingTime.room}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function GradeHistorySection({ grades, instructor, currentInstructors }) {
  if (!grades?.hasData) {
    return (
      <EmptyState
        icon="analytics"
        title="No grade history yet"
        text="There's no published grade data for this course in the available terms."
      />
    )
  }

  const instructorKey = grades.instructorDistribution?.professor

  // Only show professors who actually come up in the current search (i.e. are
  // teaching this course now) — not everyone who ever taught it. Falls back to
  // all professors when no current instructors are known.
  const currentKeys = new Set((currentInstructors || []).map(normalizeName).filter(Boolean))
  const allProfs = grades.professors || []
  const shownProfs = currentKeys.size
    ? allProfs.filter((p) => currentKeys.has(normalizeName(p.professor)))
    : allProfs

  return (
    <>
      {instructor && instructor !== 'TBA' && (
        grades.instructorHasTaught ? (
          <AggregateBlock
            aggregate={grades.instructorDistribution}
            heading={`How ${instructor} grades`}
            subheading="This section's instructor"
          />
        ) : (
          <div className="exp-notice">
            <Icon name="time" size={16} aria-hidden />
            <span>
              <strong>{instructor}</strong> hasn't taught this course in the available
              history. The course-wide distribution is shown below.
            </span>
          </div>
        )
      )}

      <AggregateBlock aggregate={grades.overall} heading="All instructors" subheading="Course-wide average" />

      {shownProfs.length > 1 && (
        <section className="exp-block">
          <div className="exp-block-head">
            <h3 className="exp-block-title">By professor</h3>
          </div>
          <div className="exp-prof-table">
            <div className="exp-prof-row exp-prof-head">
              <span className="exp-prof-name">Professor</span>
              <span>GPA</span>
              <span>DWF</span>
              <span>Semesters</span>
              <span className="exp-prof-bar-col">Distribution</span>
            </div>
            {shownProfs.map((p) => (
              <div
                key={p.professor || 'unknown'}
                className={`exp-prof-row ${p.professor && p.professor === instructorKey ? 'is-current' : ''}`}
              >
                <span className="exp-prof-name">{p.professor || 'Unknown'}</span>
                <span className={`exp-prof-gpa gpa-tone-${gpaTone(p.gpa)}`}>{formatGpa(p.gpa)}</span>
                <span className={`dwf-tone-${dwfTone(p.dwfPercent)}`}>{formatPercent(p.dwfPercent)}</span>
                <span>{p.termsTaught?.length ?? 0}</span>
                <span className="exp-prof-bar-col"><GradeBar gradeCounts={p.gradeCounts} height={7} /></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function SyllabusSection({ url }) {
  if (url) {
    return <iframe className="exp-pdf" src={url} title="Course syllabus" />
  }
  return (
    <EmptyState
      icon="bookmark"
      title="Syllabus not available yet"
      text="When a syllabus is published for this section, it'll appear here as an embedded PDF."
    />
  )
}

/**
 * Full-detail course modal that morphs out of the clicked card (Framer Motion
 * shared-layout, matching layoutId on the card). A left sidebar switches between
 * sections (Overview, Grade history, Professor ratings, Syllabus) with an animated
 * cross-fade between panes.
 */
function ExpandedCourseCard({
  course,
  grades,
  currentInstructors,
  isTrackedView,
  isWatching,
  onWatchToggle,
  getTermName,
  onClose,
}) {
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!course) return null

  const crn = course.courseReferenceNumber
  const instructor = course.faculty?.[0]?.displayName || null
  const term = course.term

  const renderWatchContent = () => {
    if (isTrackedView) return (<><Icon name="remove" size={16} aria-hidden /> Remove</>)
    if (isWatching) return (<><Icon name="watching" size={16} aria-hidden /> Watching</>)
    return (<><Icon name="watch" size={16} aria-hidden /> Watch</>)
  }

  const renderSection = () => {
    switch (tab) {
      case 'overview': return <OverviewSection course={course} />
      case 'grades': return <GradeHistorySection grades={grades} instructor={instructor} currentInstructors={currentInstructors} />
      case 'ratings': return (
        <EmptyState
          icon="people"
          title="Professor ratings coming soon"
          text={instructor && instructor !== 'TBA'
            ? `Ratings and reviews for ${instructor} will appear here.`
            : 'Ratings and reviews will appear here.'}
        />
      )
      case 'syllabus': return <SyllabusSection url={course.syllabusUrl} />
      default: return null
    }
  }

  return (
    <MotionDiv
      className="exp-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
    >
      <MotionDiv
        layoutId={`course-${crn}`}
        className="exp-modal"
        transition={MORPH}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <MotionDiv
          className="exp-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          <header className="exp-header">
            <div className="exp-heading">
              <h2 className="exp-title">
                {course.subjectDescription} ({course.subject} {course.courseNumber})
              </h2>
              <p className="exp-subtitle">{decodeHtmlEntities(course.courseTitle)}</p>
              <div className="exp-tags">
                <span className="exp-tag exp-tag--crn">CRN {crn}</span>
                <span className="exp-tag">Section {course.sequenceNumber}</span>
                <span className="exp-tag">{formatCreditHours(course.creditHourLow, course.creditHourHigh)} credits</span>
                {term && <span className="exp-tag">{getTermName?.(term) || term}</span>}
              </div>
            </div>
            <div className="exp-header-actions">
              <button
                type="button"
                className="calendar-button"
                onClick={() => { window.location.href = `/schedule-builder?add=${crn}`; }}
                title="Add to schedule"
              >
                <Icon name="calendar" size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={`watch-button ${isTrackedView ? 'state-remove' : isWatching ? 'state-active' : ''}`}
                onClick={() => onWatchToggle?.(course)}
              >
                {renderWatchContent()}
              </button>
              <button type="button" className="exp-close" onClick={onClose} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
          </header>

          <div className="exp-main">
            <nav className="exp-sidebar" aria-label="Course detail sections">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`exp-nav-item ${tab === s.id ? 'is-active' : ''}`}
                  onClick={() => setTab(s.id)}
                  aria-current={tab === s.id}
                >
                  {tab === s.id && (
                    <MotionDiv className="exp-nav-active" layoutId="expNavActive" transition={MORPH} />
                  )}
                  <Icon name={s.icon} size={17} aria-hidden />
                  <span className="exp-nav-label">{s.label}</span>
                </button>
              ))}
            </nav>

            <div className="exp-pane">
              <AnimatePresence mode="wait" initial={false}>
                <MotionDiv
                  key={tab}
                  className="exp-pane-inner"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {renderSection()}
                </MotionDiv>
              </AnimatePresence>
            </div>
          </div>
        </MotionDiv>
      </MotionDiv>
    </MotionDiv>
  )
}

export default ExpandedCourseCard
