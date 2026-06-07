import { useEffect, useMemo, useState } from 'react'
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
import rmpLogo from '../../assets/rmp.svg'
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

const PROF_PAGE_SIZE = 8

function GradeHistorySection({ grades, instructor, currentInstructors }) {
  const [profQuery, setProfQuery] = useState('')
  const [profPage, setProfPage] = useState(1)

  const instructorKey = grades?.instructorDistribution?.professor

  // Only show professors who actually come up in the current search (i.e. are
  // teaching this course now) — not everyone who ever taught it. Falls back to
  // all professors when no current instructors are known. Sorted highest GPA
  // first, then narrowed by the mini name search.
  const shownProfs = useMemo(() => {
    if (!grades?.hasData) return []
    const currentKeys = new Set((currentInstructors || []).map(normalizeName).filter(Boolean))
    const allProfs = grades.professors || []
    const scoped = currentKeys.size
      ? allProfs.filter((p) => currentKeys.has(normalizeName(p.professor)))
      : allProfs
    const q = profQuery.trim().toLowerCase()
    const filtered = q
      ? scoped.filter((p) => (p.professor || '').toLowerCase().includes(q))
      : scoped
    return [...filtered].sort((a, b) => (b.gpa ?? -1) - (a.gpa ?? -1))
  }, [grades, currentInstructors, profQuery])

  const profPageCount = Math.max(1, Math.ceil(shownProfs.length / PROF_PAGE_SIZE))
  const safeProfPage = Math.min(profPage, profPageCount)
  const pagedProfs = shownProfs.slice((safeProfPage - 1) * PROF_PAGE_SIZE, safeProfPage * PROF_PAGE_SIZE)

  // Reset to the first page whenever the search narrows or the data changes.
  useEffect(() => {
    setProfPage(1)
  }, [profQuery, grades])

  if (!grades?.hasData) {
    return (
      <EmptyState
        icon="analytics"
        title="No grade history yet"
        text="There's no published grade data for this course in the available terms."
      />
    )
  }

  // The "By professor" section is worth showing whenever more than one professor
  // is in scope, even if the active search/filter narrows it to one row.
  const scopedCount = (() => {
    const currentKeys = new Set((currentInstructors || []).map(normalizeName).filter(Boolean))
    const allProfs = grades.professors || []
    return currentKeys.size
      ? allProfs.filter((p) => currentKeys.has(normalizeName(p.professor))).length
      : allProfs.length
  })()

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

      {scopedCount > 1 && (
        <section className="exp-block">
          <div className="exp-block-head">
            <h3 className="exp-block-title">By professor</h3>
            <div className="exp-prof-search">
              <Icon name="search" size={14} aria-hidden />
              <input
                type="text"
                className="exp-prof-search-input"
                placeholder="Search professor"
                value={profQuery}
                onChange={(e) => setProfQuery(e.target.value)}
                aria-label="Search professors by name"
              />
            </div>
          </div>
          <div className="exp-prof-table">
            <div className="exp-prof-row exp-prof-head">
              <span className="exp-prof-name">Professor</span>
              <span>Avg GPA</span>
              <span>DWF</span>
              <span>Semesters</span>
              <span className="exp-prof-bar-col">Distribution</span>
            </div>
            {shownProfs.length === 0 ? (
              <div className="exp-prof-empty">No professors match “{profQuery}”.</div>
            ) : (
              pagedProfs.map((p) => (
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
              ))
            )}
          </div>

          {profPageCount > 1 && (
            <div className="exp-prof-pager">
              <button
                type="button"
                className="exp-prof-pager-btn"
                onClick={() => setProfPage((p) => Math.max(1, p - 1))}
                disabled={safeProfPage === 1}
                aria-label="Previous professors"
              >
                <Icon name="chevronDown" size={14} style={{ transform: 'rotate(90deg)' }} aria-hidden />
              </button>
              <span className="exp-prof-pager-info">
                {safeProfPage} / {profPageCount}
              </span>
              <button
                type="button"
                className="exp-prof-pager-btn"
                onClick={() => setProfPage((p) => Math.min(profPageCount, p + 1))}
                disabled={safeProfPage === profPageCount}
                aria-label="More professors"
              >
                <Icon name="chevronDown" size={14} style={{ transform: 'rotate(-90deg)' }} aria-hidden />
              </button>
            </div>
          )}
        </section>
      )}
    </>
  )
}

function ratingTone(value) {
  if (value == null) return 'unknown'
  if (value >= 4) return 'high'
  if (value >= 3.5) return 'mid'
  return 'low'
}

const DIST_ROWS = [
  { key: 'r5', label: 'Awesome', score: 5 },
  { key: 'r4', label: 'Great', score: 4 },
  { key: 'r3', label: 'Good', score: 3 },
  { key: 'r2', label: 'OK', score: 2 },
  { key: 'r1', label: 'Awful', score: 1 },
]

/** RateMyProfessors summary + a link out to the full reviews. */
function RatingsSection({ rating, instructor }) {
  if (!rating || !rating.found) {
    return (
      <EmptyState
        icon="people"
        title="No ratings found"
        text={instructor && instructor !== 'TBA'
          ? `We couldn't find ${instructor} on Rate My Professors for Georgia State.`
          : 'No instructor is listed for this section yet.'}
      />
    )
  }

  const oneDecimal = (v) => (v == null ? '—' : v.toFixed(1))
  const dist = rating.distribution
  const maxCount = dist ? Math.max(1, dist.r1, dist.r2, dist.r3, dist.r4, dist.r5) : 1
  const reviewCount = rating.numRatings ?? 0

  return (
    <div className="rmp">
      <div className="rmp-head">
        <div className="rmp-score">
          <div className={`rmp-score-num rating-tone-${ratingTone(rating.avgRating)}`}>
            {oneDecimal(rating.avgRating)}<span className="rmp-score-max">/5</span>
          </div>
          <div className="rmp-score-meta">
            <span className="rmp-score-label">Overall quality</span>
            <span className="rmp-score-sub">Based on {reviewCount} rating{reviewCount === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="rmp-secondary">
          <div className="rmp-stat">
            <span className="rmp-stat-num">
              {rating.wouldTakeAgainPercent == null ? '—' : formatPercent(rating.wouldTakeAgainPercent)}
            </span>
            <span className="rmp-stat-label">Would take again</span>
          </div>
          <div className="rmp-stat-divider" />
          <div className="rmp-stat">
            <span className="rmp-stat-num">{oneDecimal(rating.avgDifficulty)}</span>
            <span className="rmp-stat-label">Level of difficulty</span>
          </div>
        </div>
      </div>

      {dist && (
        <section className="rmp-panel">
          <h4 className="rmp-panel-title">Rating distribution</h4>
          <div className="rmp-dist">
            {DIST_ROWS.map((row) => {
              const count = dist[row.key] || 0
              return (
                <div key={row.key} className="rmp-dist-row">
                  <span className="rmp-dist-label">{row.label} <strong>{row.score}</strong></span>
                  <div className="rmp-dist-track">
                    <div className="rmp-dist-fill" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="rmp-dist-count">{count}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {rating.topTags?.length > 0 && (
        <div className="rmp-tags">
          {rating.topTags.map((t) => (
            <span key={t.name} className="rmp-tag">{t.name}</span>
          ))}
        </div>
      )}

      <a className="rmp-button" href={rating.profileUrl} target="_blank" rel="noopener noreferrer">
        <img src={rmpLogo} alt="Rate My Professors" className="rmp-button-logo" />
        <span className="rmp-cta">See all {reviewCount} review{reviewCount === 1 ? '' : 's'}</span>
        <Icon name="external" size={15} aria-hidden />
      </a>
    </div>
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
  rating,
  currentInstructors,
  isTrackedView,
  isWatching,
  isGuest = false,
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
      case 'ratings': return <RatingsSection rating={rating} instructor={instructor} />
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
            <div className="exp-header-left">
              <button type="button" className="exp-close" onClick={onClose} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
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
            </div>
            <div className="exp-header-actions">
              <button
                type="button"
                className="calendar-button"
                onClick={() => { if (isGuest) return; window.location.href = `/schedule-builder?add=${crn}`; }}
                disabled={isGuest}
                title={isGuest ? 'Sign in to add to your schedule' : 'Add to schedule'}
              >
                <Icon name="calendar" size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={`watch-button ${isTrackedView ? 'state-remove' : isWatching ? 'state-active' : ''}`}
                onClick={() => { if (isGuest) return; onWatchToggle?.(course) }}
                disabled={isGuest}
                title={isGuest ? 'Sign in to track classes' : undefined}
              >
                {renderWatchContent()}
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
