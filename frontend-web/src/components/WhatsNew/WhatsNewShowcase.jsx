import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from '../Icon'
import GradeBar from '../CourseGrades/GradeBar'
import { gpaTone, formatGpa } from '../CourseGrades/gradeUtils'
import rmpLogo from '../../assets/rmp.svg'
import '../CourseResults/CourseResults.css'
import '../ExpandedCourseCard/ExpandedCourseCard.css'
import './WhatsNewShowcase.css'

const MotionDiv = motion.div
const MotionSpan = motion.span

const SPRING = { type: 'spring', stiffness: 240, damping: 28 }
const MOCK_GRADES = { A: 44, B: 58, C: 31, D: 12, F: 9 }
const DIST = { r1: 2, r2: 0, r3: 1, r4: 0, r5: 0 }

// A linear, auto-advancing storyboard. Two "card" scenes (intro, then the new
// pieces revealed), one "expanded" scene per tab, then a full-screen welcome.
const SCENES = [
  { kind: 'card', reveal: false, headline: 'The all-new PantherWatch', sub: 'A closer look at what just changed.', dur: 2200 },
  { kind: 'card', reveal: true, headline: 'Ratings & grade history, built in', sub: 'Right on every course card.', dur: 2600 },
  { kind: 'expanded', tab: 'overview', headline: 'The full story, one click away', sub: 'Everything about a section, in one place.', dur: 1900 },
  { kind: 'expanded', tab: 'grades', headline: 'Grade history', sub: 'See exactly how each professor grades.', dur: 2100 },
  { kind: 'expanded', tab: 'ratings', headline: 'Professor ratings', sub: 'Rate My Professors, at a glance.', dur: 2100 },
  { kind: 'expanded', tab: 'syllabus', headline: 'And the syllabus', sub: 'Coming soon to every section.', dur: 1700 },
  { kind: 'welcome', dur: 2600 },
]

const TABS = [
  { id: 'overview', icon: 'dashboard', label: 'Overview' },
  { id: 'grades', icon: 'analytics', label: 'Grade history' },
  { id: 'ratings', icon: 'people', label: 'Professor ratings' },
  { id: 'syllabus', icon: 'bookmark', label: 'Syllabus' },
]

const DIST_ROWS = [
  { key: 'r5', label: 'Awesome', score: 5 },
  { key: 'r4', label: 'Great', score: 4 },
  { key: 'r3', label: 'Good', score: 3 },
  { key: 'r2', label: 'OK', score: 2 },
  { key: 'r1', label: 'Awful', score: 1 },
]

function MeetingTimes() {
  const days = [['M', true], ['T', false], ['W', true], ['T', false], ['F', true]]
  return (
    <div className="meeting-times">
      <div className="meeting-time">
        <div className="time-schedule">
          <span className="time-range">10:00 AM - 10:50 AM</span>
          <div className="days-week">
            {days.map(([d, active], i) => (
              <span key={i} className={`day-indicator ${active ? 'day-active' : ''}`}>{d}</span>
            ))}
          </div>
        </div>
        <div className="location-info">
          <span className="location-building">Classroom South</span> - Room 404
        </div>
      </div>
    </div>
  )
}

/** The real course card, 1:1. The new pieces fade in together when `reveal`. */
function ShowcaseCard({ reveal }) {
  return (
    <article className="course-card wn-card-floating">
      <header className="course-header">
        <div className="course-title-section">
          <h3 className="course-title">Computer Science (CSC 4520)</h3>
          <span className="course-crn">CRN 12345</span>
        </div>
        <div className="course-actions">
          <button type="button" className="calendar-button" tabIndex={-1}>
            <Icon name="calendar" size={18} aria-hidden />
          </button>
          <button type="button" className="watch-button" tabIndex={-1}>
            <Icon name="watch" size={18} aria-hidden /> Watch
          </button>
        </div>
      </header>

      <div className="course-body">
        <div className="course-info">
          <div className="info-item">
            <span className="info-label">Course title</span>
            <span className="info-value">Algorithms</span>
          </div>
          <div className="info-item">
            <span className="info-label">Section</span>
            <span className="info-value">001</span>
          </div>
          <div className="info-item">
            <span className="info-label">Credits</span>
            <span className="info-value">4</span>
          </div>
        </div>

        <div className="enrollment-status">
          <div className="enrollment-item">
            <span className="enrollment-number seats-available">12</span>
            <span className="enrollment-label">Available</span>
          </div>
          <div className="enrollment-item">
            <span className="enrollment-number">28</span>
            <span className="enrollment-label">Enrolled</span>
          </div>
          <div className="enrollment-item">
            <span className="enrollment-number">40</span>
            <span className="enrollment-label">Capacity</span>
          </div>
        </div>

        <div className="faculty-section">
          <div className="faculty-title">Instructor</div>
          <div className="faculty-name">
            <span className="faculty-name-text">Alina Nemira</span>
            <AnimatePresence>
              {reveal && (
                <MotionSpan
                  className="cc-rmp"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={{ ...SPRING, delay: 0.1 }}
                >
                  <img src={rmpLogo} alt="Rate My Professors" className="cc-rmp-logo" />
                  <span className="cc-rmp-score">1.7</span>
                </MotionSpan>
              )}
            </AnimatePresence>
          </div>
        </div>

        <MeetingTimes />

        <AnimatePresence>
          {reveal && (
            <MotionDiv
              className="cc-grade-line"
              initial={{ opacity: 0, height: 0, marginTop: -8 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              style={{ overflow: 'hidden' }}
            >
              <div className={`cc-gpa gpa-tone-${gpaTone(2.99)}`}>
                <span className="cc-gpa-num">{formatGpa(2.99)}</span>
                <span className="cc-gpa-label">avg GPA</span>
              </div>
              <GradeBar gradeCounts={MOCK_GRADES} height={8} />
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </article>
  )
}

function TabPane({ tab }) {
  if (tab === 'overview') {
    return (
      <>
        <div className="enrollment-status">
          <div className="enrollment-item">
            <span className="enrollment-number seats-available">12</span>
            <span className="enrollment-label">Available</span>
          </div>
          <div className="enrollment-item">
            <span className="enrollment-number">28</span>
            <span className="enrollment-label">Enrolled</span>
          </div>
          <div className="enrollment-item">
            <span className="enrollment-number">40</span>
            <span className="enrollment-label">Capacity</span>
          </div>
        </div>
        <div className="faculty-section">
          <div className="faculty-title">Instructor</div>
          <div className="faculty-name"><span className="faculty-name-text">Alina Nemira</span></div>
        </div>
        <MeetingTimes />
      </>
    )
  }
  if (tab === 'grades') {
    return (
      <section className="exp-block">
        <div className="exp-block-head">
          <div className="exp-block-headings">
            <h3 className="exp-block-title">How Alina Nemira grades</h3>
            <span className="exp-block-span">3 semesters · Fall 2023–Fall 2025</span>
          </div>
        </div>
        <div className="exp-metrics">
          <div className="exp-metric"><span className="exp-metric-value">2.99</span><span className="exp-metric-label">Avg GPA</span></div>
          <div className="exp-metric"><span className="exp-metric-value">18%</span><span className="exp-metric-label">DWF rate</span></div>
          <div className="exp-metric"><span className="exp-metric-value">86</span><span className="exp-metric-label">Students</span></div>
        </div>
        <GradeBar gradeCounts={MOCK_GRADES} showLabels height={12} />
      </section>
    )
  }
  if (tab === 'ratings') {
    const max = Math.max(1, DIST.r1, DIST.r2, DIST.r3, DIST.r4, DIST.r5)
    return (
      <div className="rmp">
        <div className="rmp-head">
          <div className="rmp-score">
            <div className="rmp-score-num rating-tone-low">1.7<span className="rmp-score-max">/5</span></div>
            <div className="rmp-score-meta">
              <span className="rmp-score-label">Overall quality</span>
              <span className="rmp-score-sub">Based on 3 ratings</span>
            </div>
          </div>
          <div className="rmp-secondary">
            <div className="rmp-stat"><span className="rmp-stat-num">33%</span><span className="rmp-stat-label">Would take again</span></div>
            <div className="rmp-stat-divider" />
            <div className="rmp-stat"><span className="rmp-stat-num">4.7</span><span className="rmp-stat-label">Level of difficulty</span></div>
          </div>
        </div>
        <section className="rmp-panel">
          <h4 className="rmp-panel-title">Rating distribution</h4>
          <div className="rmp-dist">
            {DIST_ROWS.map((row) => (
              <div key={row.key} className="rmp-dist-row">
                <span className="rmp-dist-label">{row.label} <strong>{row.score}</strong></span>
                <div className="rmp-dist-track">
                  <div className="rmp-dist-fill" style={{ width: `${(DIST[row.key] / max) * 100}%` }} />
                </div>
                <span className="rmp-dist-count">{DIST[row.key]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }
  return (
    <div className="exp-empty-state">
      <Icon name="bookmark" size={30} aria-hidden />
      <p className="exp-empty-title">Syllabus</p>
      <p className="exp-empty-text">The section's syllabus will appear here as an embedded PDF.</p>
    </div>
  )
}

/** A 1:1 expanded detail card; the active tab is driven from the storyboard. */
function ShowcaseExpanded({ activeTab }) {
  return (
    <div className="exp-modal wn-expanded-floating">
      <header className="exp-header">
        <div className="exp-header-left">
          <button type="button" className="exp-close" tabIndex={-1}><Icon name="x" size={16} /></button>
          <div className="exp-heading">
            <h2 className="exp-title">Computer Science (CSC 4520)</h2>
            <p className="exp-subtitle">Algorithms</p>
            <div className="exp-tags">
              <span className="exp-tag exp-tag--crn">CRN 12345</span>
              <span className="exp-tag">Section 001</span>
              <span className="exp-tag">4 credits</span>
            </div>
          </div>
        </div>
      </header>
      <div className="exp-main">
        <nav className="exp-sidebar">
          {TABS.map((t) => (
            <div key={t.id} className={`exp-nav-item ${activeTab === t.id ? 'is-active' : ''}`}>
              {activeTab === t.id && (
                <MotionDiv className="exp-nav-active" layoutId="wnNavActive" transition={SPRING} />
              )}
              <Icon name={t.icon} size={17} aria-hidden />
              <span className="exp-nav-label">{t.label}</span>
            </div>
          ))}
        </nav>
        <div className="exp-pane">
          <AnimatePresence mode="wait">
            <MotionDiv
              key={activeTab}
              className="exp-pane-inner"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <TabPane tab={activeTab} />
            </MotionDiv>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default function WhatsNewShowcase({ onClose }) {
  const [scene, setScene] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const isLast = scene >= SCENES.length - 1
    const t = setTimeout(() => {
      if (isLast) setFading(true)
      else setScene((s) => s + 1)
    }, SCENES[scene].dur)
    return () => clearTimeout(t)
  }, [scene])

  // Once the welcome scene has held, fade the whole thing out, then unmount.
  useEffect(() => {
    if (!fading) return
    const t = setTimeout(onClose, 900)
    return () => clearTimeout(t)
  }, [fading, onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const current = SCENES[scene]
  const isExpanded = current.kind === 'expanded'
  const isWelcome = current.kind === 'welcome'

  return (
    <MotionDiv
      className="wn-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: fading ? 0.9 : 0.4, ease: 'easeInOut' }}
      onClick={onClose}
    >
      <AnimatePresence mode="wait">
        {isWelcome ? (
          <MotionDiv
            key="welcome"
            className="wn-welcome"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <h1 className="wn-welcome-text">Welcome to PantherWatch</h1>
          </MotionDiv>
        ) : (
          <MotionDiv key="story" className="wn-story">
            <div className="wn-text">
              <AnimatePresence mode="wait">
                <MotionDiv
                  key={current.headline}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <h1 className="wn-headline">{current.headline}</h1>
                  <p className="wn-subline">{current.sub}</p>
                </MotionDiv>
              </AnimatePresence>
            </div>

            <div className="wn-perspective" onClick={(e) => e.stopPropagation()}>
              <AnimatePresence mode="wait">
                {isExpanded ? (
                  <MotionDiv
                    key="expanded"
                    className="wn-3d"
                    initial={{ opacity: 0, rotateX: 24, scale: 0.9, y: 26 }}
                    animate={{ opacity: 1, rotateX: 0, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={SPRING}
                  >
                    <ShowcaseExpanded activeTab={current.tab} />
                  </MotionDiv>
                ) : (
                  <MotionDiv
                    key="card"
                    className="wn-3d"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.06, rotateX: 18 }}
                    transition={{ ...SPRING, duration: 0.5 }}
                  >
                    {/* Inner layer owns the slow, continuous 3D turn. Keyframes
                        start and end at 0 so there's no snap on mount. */}
                    <MotionDiv
                      className="wn-rotor"
                      animate={{ rotateY: [0, 15, 0, -15, 0] }}
                      transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 0.45 }}
                      style={{ rotateX: 7 }}
                    >
                      <ShowcaseCard reveal={current.reveal} />
                    </MotionDiv>
                  </MotionDiv>
                )}
              </AnimatePresence>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>

      {!isWelcome && (
        <button type="button" className="wn-skip" onClick={onClose}>Skip</button>
      )}
    </MotionDiv>
  )
}
