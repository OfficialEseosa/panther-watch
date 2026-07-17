import { useState, useEffect, useCallback, useRef } from 'react'
import { ScheduleContext } from './ScheduleContext.js'
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  fetchScheduleEntries,
  fetchCourseSections,
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
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [conflictNotice, setConflictNotice] = useState(null)
  const conflictTimerRef = useRef(null)
  const scheduleRef = useRef(scheduleByTerm)
  const syncedRef = useRef(false)

  useEffect(() => {
    scheduleRef.current = scheduleByTerm
    saveToLocalStorage(scheduleByTerm)
  }, [scheduleByTerm])

  useEffect(() => () => clearTimeout(conflictTimerRef.current), [])

  // On sign-in, reconcile with the database so the schedule follows the
  // account across devices: local-only classes are pushed up, and DB-only
  // entries (added on another device) are hydrated back into full course
  // objects by searching their subject + course number on GoSolar and
  // picking the section with the matching CRN.
  useEffect(() => {
    if (!isAuthenticated) {
      syncedRef.current = false
      return
    }
    if (syncedRef.current) return
    syncedRef.current = true

    let cancelled = false

    const syncFromDatabase = async () => {
      setScheduleLoading(true)
      try {
        const dbEntriesByTerm = await fetchScheduleEntries()
        const local = scheduleRef.current

        // Push classes that only exist locally (added while signed out, or
        // while the DB sync was failing) up to the database.
        Object.entries(local).forEach(([termCode, courses]) => {
          const dbCrns = new Set((dbEntriesByTerm[termCode] || []).map((e) => e.crn))
          courses.forEach((course) => {
            if (!dbCrns.has(course.courseReferenceNumber)) {
              addCourse(termCode, course).catch((error) => {
                console.error('Failed to push local schedule entry to database:', error)
              })
            }
          })
        })

        // Entries the database has but this device doesn't, grouped by
        // term+subject+courseNumber so each course is searched only once
        // even when several of its sections are scheduled.
        const groups = new Map()
        Object.entries(dbEntriesByTerm).forEach(([termCode, entries]) => {
          const localCrns = new Set(
            (local[termCode] || []).map((course) => course.courseReferenceNumber)
          )
          entries.forEach((entry) => {
            if (localCrns.has(entry.crn)) return
            if (!entry.subject || !entry.courseNumber) {
              console.warn(`Schedule entry ${entry.crn} has no course identity; skipping hydration`)
              return
            }
            const key = `${termCode}|${entry.subject}|${entry.courseNumber}`
            if (!groups.has(key)) {
              groups.set(key, { termCode, subject: entry.subject, courseNumber: entry.courseNumber, crns: [] })
            }
            groups.get(key).crns.push(entry.crn)
          })
        })
        if (groups.size === 0) return

        const hydrated = await Promise.all(
          [...groups.values()].map(async (group) => {
            try {
              const sections = await fetchCourseSections(
                group.termCode,
                group.subject,
                group.courseNumber
              )
              return group.crns
                .map((crn) => sections.find((s) => s.courseReferenceNumber === crn))
                .filter(Boolean)
                .map((course) => ({ termCode: group.termCode, course }))
            } catch (error) {
              console.error(`Failed to hydrate ${group.subject} ${group.courseNumber}:`, error)
              return []
            }
          })
        )
        if (cancelled) return

        setScheduleByTerm((prev) => {
          const next = { ...prev }
          hydrated.flat().forEach(({ termCode, course }) => {
            const current = next[termCode] || []
            const exists = current.some(
              (c) => c.courseReferenceNumber === course.courseReferenceNumber
            )
            if (exists) return
            next[termCode] = [
              ...current,
              { ...course, scheduleColor: pickDefaultColor(current) }
            ]
          })
          return next
        })
      } catch (error) {
        console.error('Failed to load schedule from database:', error)
      } finally {
        if (!cancelled) setScheduleLoading(false)
      }
    }

    syncFromDatabase()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

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
        addCourse(termCode, normalizedCourse).catch((error) => {
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
    scheduleLoading,
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
