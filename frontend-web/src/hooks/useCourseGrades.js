import { useEffect, useState } from 'react'
import { gradeService } from '../config/gradeService.js'

/**
 * Loads the grade distribution for a course (optionally resolved to a specific
 * instructor). Returns { grades, loading }. `grades` is null when there is no
 * scraped history for the course. Safe to call from every card: the service
 * caches per course/instructor for the session.
 */
export function useCourseGrades({ subject, courseNumber, instructor, enabled = true }) {
  const [grades, setGrades] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !subject || !courseNumber) {
      setGrades(null)
      return
    }

    let active = true
    setLoading(true)
    gradeService
      .getCourseGrades({ subject, courseNumber, instructor })
      .then((data) => {
        if (active) setGrades(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [subject, courseNumber, instructor, enabled])

  return { grades, loading }
}

export default useCourseGrades
