import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { buildApiUrl } from '../../config'
import './CourseResultsPage.css'
import CourseResults from '../../components/CourseResults'
import { getTermName } from '../../utils'
import { watchedClassService } from '../../config'

function CourseResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchParams, setSearchParams] = useState(null)
  const [watchedCrns, setWatchedCrns] = useState([])

  useEffect(() => {
    // Get search parameters from URL or state
    const params = new URLSearchParams(location.search)
    const searchData = {
      txtLevel: params.get('txtLevel') || '',
      txtSubject: params.get('txtSubject') || '',
      txtTerm: params.get('txtTerm') || '',
      txtCourseNumber: params.get('txtCourseNumber') || ''
    }
    
    setSearchParams(searchData)

    // If no search parameters, redirect back to search
    if (!searchData.txtSubject || !searchData.txtTerm || !searchData.txtCourseNumber || !searchData.txtLevel) {
      navigate('/course-search')
      return
    }

    performSearch(searchData)
    fetchWatchedClasses()
  }, [location, navigate])

  const fetchWatchedClasses = async () => {
    try {
      const watchedClasses = await watchedClassService.getWatchedClasses()
      const crns = watchedClasses.map(wc => wc.crn)
      setWatchedCrns(crns)
    } catch (error) {
      console.error('Failed to fetch watched classes:', error)
    }
  }

  const performSearch = async (searchData) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams(searchData)
      const res = await fetch(`${buildApiUrl('/courses/search')}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: "application/json" },
      })

      if (!res.ok) {
        setError(`Search request failed (status ${res.status}). Please try again.`)
        setCourses([])
        setLoading(false)
        return
      }

      const json = await res.json()
      console.log("Response data:", json)
      
      if (json.success) {
        setCourses(json.data || [])
      } else {
        setError('Search failed. Please try again.')
      }
    } catch (err) {
      console.error("An error occurred:", err)
      setError('An error occurred while searching. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleNewSearch = () => {
    navigate('/course-search')
  }

  return (
    <div className="course-results-page">
      <div className="course-results-container">
        <button onClick={handleNewSearch} className="new-search-button">
          ← New Search
        </button>
        {searchParams && (
          <div className="search-summary">
            Search: {searchParams.txtSubject} {searchParams.txtCourseNumber} - {getTermName(searchParams.txtTerm)}
          </div>
        )}
      </div>
      
      <CourseResults 
        courses={courses}
        loading={loading}
        error={error}
        selectedTerm={searchParams?.txtTerm}
        watchedCrns={watchedCrns}
      />
    </div>
  )
}

export default CourseResultsPage
