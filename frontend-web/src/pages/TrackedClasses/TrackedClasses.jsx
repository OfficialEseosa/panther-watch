import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { watchedClassService } from '../../config/watchedClassService.js'
import CourseResults from '../../components/CourseResults'
import './TrackedClasses.css'

function TrackedClasses() {
  const navigate = useNavigate()
  const [watchedClasses, setWatchedClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadWatchedClasses()
  }, [])

  const loadWatchedClasses = async () => {
    try {
      setLoading(true)
      setError('')
      const classes = await watchedClassService.getWatchedClassesWithFullDetails()
      setWatchedClasses(classes)
    } catch (error) {
      console.error('Failed to load watched classes:', error)
      setError('Failed to load tracked classes. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCourseRemoved = (removedCourse) => {
    setWatchedClasses(prevClasses => 
      prevClasses.filter(course => 
        course.courseReferenceNumber !== removedCourse.courseReferenceNumber || 
        course.term !== removedCourse.term
      )
    )
  }

  return (
    <div className="tracked-classes-page">
      <div className="page-header">
        <h2 className="page-title">Your Tracked Classes</h2>
        
        {watchedClasses.length === 0 && !loading ? (
          <p className="page-description">
            You haven't tracked any classes yet. Search for classes and add them to your watch list!
          </p>
        ) : (
          <>
            <div className="tracking-stats">
              Currently tracking
              <span className="count">{watchedClasses.length}</span>
              {watchedClasses.length === 1 ? 'class' : 'classes'}
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
          {watchedClasses.length > 0 ? 'Find More Classes' : 'Start Searching'}
        </button>
      </div>
      
      {/* Use CourseResults component for consistent display */}
      <CourseResults 
        courses={watchedClasses}
        loading={loading}
        error={error}
        selectedTerm={watchedClasses[0]?.term || ''}
        isTrackedView={true}
        onCourseRemoved={handleCourseRemoved}
      />
    </div>
  )
}

export default TrackedClasses
