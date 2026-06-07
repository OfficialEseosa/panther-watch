import { useEffect, useState } from 'react'
import { syllabusService } from '../config/syllabusService.js'

/**
 * Looks up whether a section has a published syllabus and its embeddable PDF URL.
 * Returns { syllabus, loading }. `syllabus` is null while loading / on error, and
 * has available:false when none is published. The service caches per term + CRN.
 */
export function useSyllabus({ term, crn, enabled = true }) {
  const [syllabus, setSyllabus] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !term || !crn) {
      setSyllabus(null)
      return
    }

    let active = true
    setLoading(true)
    syllabusService
      .getSyllabus({ term, crn })
      .then((data) => {
        if (active) setSyllabus(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [term, crn, enabled])

  return { syllabus, loading }
}

export default useSyllabus
