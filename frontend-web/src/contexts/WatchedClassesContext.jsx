import { useState, useEffect, useCallback } from 'react'
import { WatchedClassesContext } from './WatchedClassesContext.js'
import { watchedClassService } from '../config/watchedClassService.js'
import { useAuth } from '../hooks/useAuth.js'

const DETAIL_MAX_ATTEMPTS = 5
const DETAIL_RETRY_DELAY_MS = 2000

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export function WatchedClassesProvider({ children }) {
  const { userInfo, isAuthenticated } = useAuth()
  const [watchedClasses, setWatchedClasses] = useState([])
  const [watchedClassesWithDetails, setWatchedClassesWithDetails] = useState([])
  const [watchedCount, setWatchedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

      let baseClasses = watchedClasses
      if (!Array.isArray(baseClasses) || baseClasses.length === 0) {
        const latestBase = await watchedClassService.getWatchedClasses()
        baseClasses = Array.isArray(latestBase) ? latestBase : []
        setWatchedClasses(baseClasses)
        setWatchedCount(baseClasses.length)
      }

      const expectedCount = Array.isArray(baseClasses) ? baseClasses.length : 0
      let bestResult = []
      let attempt = 0
      let lastError = null

      while (attempt < DETAIL_MAX_ATTEMPTS) {
        attempt += 1
        try {
          const detailedClasses = await watchedClassService.getWatchedClassesWithFullDetails()
          const detailArray = Array.isArray(detailedClasses) ? detailedClasses : []

          if (detailArray.length > bestResult.length) {
            bestResult = detailArray
          }

          if (expectedCount === 0) {
            bestResult = detailArray
            break
          }

          if (detailArray.length >= expectedCount) {
            bestResult = detailArray
            break
          }
        } catch (err) {
          lastError = err
          if (attempt === DETAIL_MAX_ATTEMPTS) {
            throw err
          }
        }

        if (attempt < DETAIL_MAX_ATTEMPTS) {
          await wait(DETAIL_RETRY_DELAY_MS)
        }
      }

      if (expectedCount > 0 && bestResult.length < expectedCount) {
        throw lastError || new Error('Tracked class details were unavailable after multiple attempts.')
      }

      setWatchedClassesWithDetails(bestResult)
      return bestResult
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
