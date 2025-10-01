import { useState, useEffect } from 'react'
import { WatchedClassesContext } from './WatchedClassesContext.js'
import { watchedClassService } from '../config/watchedClassService.js'
import { useAuth } from '../hooks/useAuth.js'

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

  const loadWatchedClassesWithDetails = async () => {
    try {
      setError(null)
      const classesWithDetails = await watchedClassService.getWatchedClassesWithFullDetails()
      setWatchedClassesWithDetails(classesWithDetails || [])
      return classesWithDetails
    } catch (err) {
      console.error('Failed to load watched classes with details:', err)
      setError(err)
      setWatchedClassesWithDetails([])
      throw err
    }
  }

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
