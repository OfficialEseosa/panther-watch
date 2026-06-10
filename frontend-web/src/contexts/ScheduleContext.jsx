import { useState, useEffect, useCallback, useRef } from 'react'
import { ScheduleContext } from './ScheduleContext.js'
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  addCourse,
  removeCourse
} from '../config/scheduleService.js'
import { findScheduleConflicts } from '../utils/scheduleConflicts.js'
import { pickDefaultColor } from '../utils/scheduleColors.js'
import { useAuth } from '../hooks/useAuth.js'
import Icon from '../components/Icon'

/**
 * Global schedule state: full course objects per term in localStorage, mirrored
 * to the database (CRNs only) when authenticated. Lives at the app level so the
 * search pages can add/remove classes in place without navigating to the
 * Schedule Builder.
 */
export function ScheduleProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [scheduleByTerm, setScheduleByTerm] = useState(() => loadFromLocalStorage())
  const [conflictNotice, setConflictNotice] = useState(null)
  const conflictTimerRef = useRef(null)

  useEffect(() => {
    saveToLocalStorage(scheduleByTerm)
  }, [scheduleByTerm])

  useEffect(() => () => clearTimeout(conflictTimerRef.current), [])

  const showConflictNotice = useCallback((notice) => {
    clearTimeout(conflictTimerRef.current)
    setConflictNotice(notice)
    conflictTimerRef.current = setTimeout(() => setConflictNotice(null), 6000)
  }, [])

  const addCourseToSchedule = useCallback(
    (course, fallbackTerm) => {
      if (!course?.courseReferenceNumber) return false
      const termCode = course.term || fallbackTerm
      if (!termCode) return false

      // Refuse adds that clash with something already on the schedule, and say
      // exactly what they clash with (every overlapping class, not just one).
      const existingCourses = scheduleByTerm[termCode] || []
      const conflicts = findScheduleConflicts(course, existingCourses)
      if (conflicts.length > 0) {
        showConflictNotice({
          courseCode: `${course.subject} ${course.courseNumber}`,
          conflicts: conflicts.map((c) => ({
            courseCode: c.courseCode,
            detail: `${c.day} ${c.timeLabel}`
          }))
        })
        return false
      }

      let added = false
      const normalizedCourse = {
        ...course,
        term: termCode,
        scheduleColor: course.scheduleColor || pickDefaultColor(existingCourses)
      }

      setScheduleByTerm((prev) => {
        const current = prev[termCode] || []
        const exists = current.some(
          (item) => item.courseReferenceNumber === normalizedCourse.courseReferenceNumber
        )
        if (exists) {
          return prev
        }
        added = true
        return {
          ...prev,
          [termCode]: [...current, normalizedCourse]
        }
      })

      // Optimistic update: UI state is already changed, DB sync runs in background.
      if (added && isAuthenticated) {
        addCourse(termCode, normalizedCourse.courseReferenceNumber).catch((error) => {
          console.error('Failed to sync schedule add to database:', error)
        })
      }

      return added
    },
    [isAuthenticated, scheduleByTerm, showConflictNotice]
  )

  const removeCourseFromSchedule = useCallback(
    (termCode, crn) => {
      if (!termCode || !crn) return

      let removed = false
      setScheduleByTerm((prev) => {
        const current = prev[termCode] || []
        const updated = current.filter((course) => course.courseReferenceNumber !== crn)
        if (updated.length === current.length) {
          return prev
        }
        removed = true
        const next = { ...prev }
        if (updated.length > 0) {
          next[termCode] = updated
        } else {
          delete next[termCode]
        }
        return next
      })

      if (removed && isAuthenticated) {
        removeCourse(termCode, crn).catch((error) => {
          console.error('Failed to sync schedule remove to database:', error)
        })
      }
    },
    [isAuthenticated]
  )

  /**
   * Drop entire terms from the schedule (used to clean out terms that have
   * become view-only). Syncs each removal to the database.
   */
  const removeTermsFromSchedule = useCallback(
    (termCodes) => {
      if (!Array.isArray(termCodes) || termCodes.length === 0) return

      const removedByTerm = {}
      setScheduleByTerm((prev) => {
        const next = { ...prev }
        let changed = false
        termCodes.forEach((termCode) => {
          if (next[termCode]) {
            removedByTerm[termCode] = next[termCode]
            delete next[termCode]
            changed = true
          }
        })
        return changed ? next : prev
      })

      if (isAuthenticated) {
        Object.entries(removedByTerm).forEach(([termCode, courses]) => {
          courses.forEach((course) => {
            removeCourse(termCode, course.courseReferenceNumber).catch((error) => {
              console.error('Failed to sync schedule cleanup to database:', error)
            })
          })
        })
      }
    },
    [isAuthenticated]
  )

  /**
   * Persist a user-chosen calendar color for a scheduled class. Colors are a
   * display preference, stored locally with the course object (the database
   * only keeps CRNs).
   */
  const setCourseColor = useCallback((termCode, crn, color) => {
    if (!termCode || !crn || !color) return
    setScheduleByTerm((prev) => {
      const current = prev[termCode] || []
      let changed = false
      const updated = current.map((course) => {
        if (course.courseReferenceNumber !== crn || course.scheduleColor === color) {
          return course
        }
        changed = true
        return { ...course, scheduleColor: color }
      })
      return changed ? { ...prev, [termCode]: updated } : prev
    })
  }, [])

  const isCourseScheduled = useCallback(
    (course, fallbackTerm) => {
      if (!course?.courseReferenceNumber) return false
      const termCode = course.term || fallbackTerm
      if (!termCode) return false
      const current = scheduleByTerm[termCode] || []
      return current.some(
        (item) => item.courseReferenceNumber === course.courseReferenceNumber
      )
    },
    [scheduleByTerm]
  )

  const value = {
    scheduleByTerm,
    addCourseToSchedule,
    removeCourseFromSchedule,
    removeTermsFromSchedule,
    isCourseScheduled,
    setCourseColor
  }

  return (
    <ScheduleContext.Provider value={value}>
      {children}
      {conflictNotice && (
        <div className="schedule-conflict-toast" role="alert">
          <Icon name="time" size={18} aria-hidden />
          <div className="schedule-conflict-copy">
            <strong>Time conflict</strong>
            <span>
              {conflictNotice.courseCode} overlaps{' '}
              {conflictNotice.conflicts
                .map((c) => `${c.courseCode} (${c.detail})`)
                .join(' and ')}
              . Remove {conflictNotice.conflicts.length > 1 ? 'those classes' : 'it'} from
              your schedule first.
            </span>
          </div>
          <button
            type="button"
            className="schedule-conflict-dismiss"
            onClick={() => setConflictNotice(null)}
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} aria-hidden />
          </button>
        </div>
      )}
    </ScheduleContext.Provider>
  )
}
