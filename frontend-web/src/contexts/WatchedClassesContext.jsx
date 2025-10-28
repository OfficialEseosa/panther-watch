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
  
  useEffect(() => {
    watchedClassesRef.current = watchedClasses
  }, [watchedClasses])

  useEffect(() => {
    if (isAuthenticated && userInfo) {
      loadWatchedData()
    } else {
      setWatchedClasses([])
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
      setWatchedClasses(classes || [])
    } catch (err) {
      console.error('Failed to load watched classes data:', err)
      setError(err)
      setWatchedCount(0)
      setWatchedClasses([])
    } finally {
      setLoading(false)
    }
  }

  const loadWatchedClassesWithDetails = useCallback(async () => {
    try {
      setError(null)

      // ALWAYS fetch both to ensure consistency and avoid race conditions
      const [detailedClasses, baseClasses] = await Promise.all([
        watchedClassService.getWatchedClassesWithFullDetails(),
        watchedClassService.getWatchedClasses()
      ])

      // Update base classes state if we got data
      if (Array.isArray(baseClasses) && baseClasses.length > 0) {
        setWatchedClasses(baseClasses)
        setWatchedCount(baseClasses.length)
      }

      const detailedArray = Array.isArray(detailedClasses) ? detailedClasses : []
      const baseArray = Array.isArray(baseClasses) ? baseClasses : []

      // Create detail map for O(1) lookups
      const detailMap = new Map(
        detailedArray
          .filter(course => course && course.courseReferenceNumber)
          .map(course => [course.courseReferenceNumber, { ...course, isPartialData: false }])
      )

      const merged = baseArray.map(tracked => {
        const detail = detailMap.get(tracked.crn)
        if (detail) {
          detailMap.delete(tracked.crn)
          return {
            ...detail,
            term: detail.term || tracked.term,
            courseReferenceNumber: detail.courseReferenceNumber || tracked.crn
          }
        }

        // No detail found, create fallback
        return createDefaultClassDetail(tracked)
      })

      // Add any remaining detailed classes that weren't in base list
      // (This handles edge case where detail API has classes not in base API)
      detailMap.forEach(detail => {
        merged.push({
          ...detail,
          isPartialData: false,
          term: detail.term || null,
          courseReferenceNumber: detail.courseReferenceNumber
        })
      })

      console.log('Merged watched classes:', merged.length, 'classes')
      setWatchedClassesWithDetails(merged)
      return merged
    } catch (err) {
      console.error('Failed to load watched classes with details:', err)
      setError(err)
      setWatchedClassesWithDetails([])
      throw err
    }
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
    return watchedClasses.some(wc => 
      wc.crn === crn && wc.term === term
    )
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
