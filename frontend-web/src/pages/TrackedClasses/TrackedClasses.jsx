import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchedClasses } from '../../contexts/WatchedClassesContext'
import CourseResults from '../../components/CourseResults'
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

  useEffect(() => {
    loadWatchedClasses()
  }, [])

  const loadWatchedClasses = async () => {
    try {
      setError('')
      await loadWatchedClassesWithDetails()
    } catch (error) {
      console.error('Failed to load watched classes:', error)
      setError('Failed to load tracked classes. Please try again.')
    }
  }

  const handleCourseRemoved = async (removedCourse) => {
  }

      return (
    <div className="tracked-classes-page">
      <div className="page-header">
        <h2 className="page-title">Your Tracked Classes</h2>
        
        {watchedClassesWithDetails.length === 0 && !loading ? (
          <p className="page-description">
            You haven't tracked any classes yet. Search for classes and add them to your watch list!
          </p>
        ) : (
          <>
            <div className="tracking-stats" aria-live="polite">
              <span className="label">Tracking</span>
              <span className="count">{watchedClassesWithDetails.length}</span>
              <span className="label">{watchedClassesWithDetails.length === 1 ? 'class' : 'classes'}</span>
            </div>
            <p className="page-description">
              Stay updated with real-time enrollment information for your selected courses
            </p>
          </>
        )}
        
        <button 
          className="search-more-btn"
          onClick={() => navigate('/course-search')}
        >
          {watchedClassesWithDetails.length > 0 ? 'Find More Classes' : 'Start Searching'}
        </button>
      </div>
      
      {/* Use CourseResults component for consistent display */}
      <CourseResults 
        courses={watchedClassesWithDetails}
        loading={loading}
        error={error || contextError}
        isTrackedView={true}
        onCourseRemoved={handleCourseRemoved}
      />
    </div>
  )
}

export default TrackedClasses
