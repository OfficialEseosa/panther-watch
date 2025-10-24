import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js'
import CourseResults from '../../components/CourseResults'
import LoadingBar from '../../components/LoadingBar'
import './TrackedClasses.css'

function TrackedClasses() {
  const navigate = useNavigate()
  const {
    watchedClassesWithDetails,
    loadWatchedClassesWithDetails,
    loading,
    error: contextError
  } = useWatchedClasses()
  const [error, setError] = useState('')
  const [detailsLoading, setDetailsLoading] = useState(false)

  const loadWatchedClasses = useCallback(async () => {
    try {
      setError('')
      setDetailsLoading(true)
      await loadWatchedClassesWithDetails()
    } catch (err) {
      console.error('Failed to load watched classes:', err)
      setError('Failed to load tracked classes. Please try again.')
    } finally {
      setDetailsLoading(false)
    }
  }, [loadWatchedClassesWithDetails])

  useEffect(() => {
    loadWatchedClasses()
  }, [loadWatchedClasses])

  const handleCourseRemoved = useCallback(() => {
    loadWatchedClasses()
  }, [loadWatchedClasses])

  const trackedCount = watchedClassesWithDetails.length
  const hasTrackedClasses = trackedCount > 0

  return (
    <div className="tracked-classes-page">
      {loading && <LoadingBar message="Loading tracked classes..." />}
      
      <div className="page-header">
        <h2 className="page-title">Your Tracked Classes</h2>

        {detailsLoading ? (
          <p className="page-description">Loading your tracked classes…</p>
        ) : !hasTrackedClasses ? (
          <p className="page-description">
            You have not added any classes yet. Search for courses and add the sections you care about.
          </p>
        ) : (
          <>
            <div className="tracking-stats" aria-live="polite">
              <span className="label">Tracking</span>
              <span className="count">{trackedCount}</span>
              <span className="label">{trackedCount === 1 ? 'class' : 'classes'}</span>
            </div>
            <p className="page-description">
              Stay up to date with enrollment changes and move quickly when seats become available.
            </p>
          </>
        )}

        <button
          type="button"
          className="search-more-btn"
          onClick={() => navigate('/course-search')}
        >
          {hasTrackedClasses ? 'Find more classes' : 'Start searching'}
        </button>
      </div>

      <CourseResults
        courses={watchedClassesWithDetails}
        loading={detailsLoading}
        error={error || contextError}
        isTrackedView={true}
        onCourseRemoved={handleCourseRemoved}
      />
    </div>
  )
}

export default TrackedClasses
