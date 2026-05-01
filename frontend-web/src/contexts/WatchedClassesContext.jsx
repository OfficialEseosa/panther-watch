import { useState, useEffect, useCallback, useRef } from 'react'
import { WatchedClassesContext } from './WatchedClassesContext.js'
import { watchedClassService } from '../config/watchedClassService.js'
import { useAuth } from '../hooks/useAuth.js'

const createDefaultClassDetail = (tracked) => ({
  courseReferenceNumber: tracked.crn,
  subject: tracked.subject,
  subjectDescription: tracked.subject,
  courseNumber: tracked.courseNumber,
  courseTitle: tracked.courseTitle,
  term: tracked.term,
  sequenceNumber: tracked.sequenceNumber || '',
  creditHourLow: null,
  creditHourHigh: null,
  seatsAvailable: 0,
  enrollment: 0,
  maximumEnrollment: 0,
  waitCount: 0,
  waitCapacity: 0,
  waitAvailable: 0,
  faculty: tracked.instructor ? [{ displayName: tracked.instructor }] : [],
  meetingsFaculty: [],
  isPartialData: true
})

export function WatchedClassesProvider({ children }) {
  const { userInfo, isAuthenticated } = useAuth()
  const [watchedClasses, setWatchedClasses] = useState([])
  const [watchedClassesWithDetails, setWatchedClassesWithDetails] = useState([])
  const [watchedCount, setWatchedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const watchedClassesRef = useRef([])
  const inFlightDetailsRef = useRef(null)

  useEffect(() => {
    watchedClassesRef.current = watchedClasses
  }, [watchedClasses])

  useEffect(() => {
    if (isAuthenticated && userInfo) {
      loadWatchedData()
    } else {
      setWatchedClasses([])
      setWatchedClassesWithDetails([])
      setWatchedCount(0)
      setLoading(false)
    }
  }, [isAuthenticated, userInfo])

  const loadWatchedData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [count, classes] = await Promise.all([
        watchedClassService.getWatchedClassCount(),
        watchedClassService.getWatchedClasses()
      ])

      setWatchedCount(typeof count === 'number' ? count : 0)
      setWatchedClasses(Array.isArray(classes) ? classes : [])
    } catch (err) {
      console.error('Failed to load watched classes data:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const loadWatchedClassesWithDetails = useCallback(async () => {
    // De-dupe concurrent calls (Dashboard mount + TrackedClasses mount can overlap).
    if (inFlightDetailsRef.current) {
      return inFlightDetailsRef.current
    }

    const run = (async () => {
      try {
        setError(null)

        // Always fetch the base list — it's the source of truth for which classes
        // should be displayed. Then attempt to enrich with details. If enrichment
        // fails, we still show every tracked class with placeholder data.
        const baseClasses = await watchedClassService.getWatchedClasses().catch((err) => {
          console.error('base getWatchedClasses failed in details flow:', err)
          return watchedClassesRef.current || []
        })
        const baseArray = Array.isArray(baseClasses) ? baseClasses : []

        if (baseArray.length > 0) {
          setWatchedClasses(baseArray)
          setWatchedCount(baseArray.length)
        }

        let detailedArray = []
        try {
          const detailedClasses = await watchedClassService.getWatchedClassesWithFullDetails()
          detailedArray = Array.isArray(detailedClasses) ? detailedClasses : []
        } catch (err) {
          console.warn('full-details failed, falling back to placeholders:', err?.message || err)
        }

        const detailMap = new Map(
          detailedArray
            .filter((course) => course && course.courseReferenceNumber)
            .map((course) => [course.courseReferenceNumber, { ...course, isPartialData: !!course.isPartialData }])
        )

        const merged = baseArray.map((tracked) => {
          const detail = detailMap.get(tracked.crn)
          if (detail) {
            detailMap.delete(tracked.crn)
            return {
              ...detail,
              term: detail.term || tracked.term,
              courseReferenceNumber: detail.courseReferenceNumber || tracked.crn
            }
          }
          return createDefaultClassDetail(tracked)
        })

        // Edge case: backend returned details for CRNs not yet in the base list
        // (e.g. base list cache was stale). Append them so nothing is lost.
        detailMap.forEach((detail) => {
          merged.push({
            ...detail,
            term: detail.term || null,
            courseReferenceNumber: detail.courseReferenceNumber
          })
        })

        setWatchedClassesWithDetails(merged)
        return merged
      } catch (err) {
        console.error('Failed to load watched classes with details:', err)
        setError(err)
        // Last-resort fallback: render whatever we have in base state with placeholders.
        const fallback = (watchedClassesRef.current || []).map(createDefaultClassDetail)
        setWatchedClassesWithDetails(fallback)
        return fallback
      } finally {
        inFlightDetailsRef.current = null
      }
    })()

    inFlightDetailsRef.current = run
    return run
  }, [])

  const addWatchedClass = async (classData) => {
    try {
      setError(null)
      const result = await watchedClassService.addWatchedClass(classData)
      await loadWatchedData()
      return result
    } catch (err) {
      console.error('Failed to add watched class:', err)
      setError(err)
      throw err
    }
  }

  const removeWatchedClass = async (crn, term) => {
    try {
      setError(null)
      const result = await watchedClassService.removeWatchedClass(crn, term)
      await loadWatchedData()
      return result
    } catch (err) {
      console.error('Failed to remove watched class:', err)
      setError(err)
      throw err
    }
  }

  const isWatchingClass = (crn, term) => {
    return watchedClasses.some((wc) => wc.crn === crn && wc.term === term)
  }

  const refreshData = () => {
    if (isAuthenticated && userInfo) {
      watchedClassService.clearCache()
      return loadWatchedData()
    }
  }

  const value = {
    watchedClasses,
    watchedClassesWithDetails,
    watchedCount,
    loading,
    error,
    addWatchedClass,
    removeWatchedClass,
    isWatchingClass,
    loadWatchedClassesWithDetails,
    refreshData
  }

  return (
    <WatchedClassesContext.Provider value={value}>
      {children}
    </WatchedClassesContext.Provider>
  )
}
