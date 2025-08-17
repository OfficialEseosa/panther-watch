import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import '../../App.css'
import CourseResults from '../../components/CourseResults'
import { getTermName } from '../../utils'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

function CourseResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userInfo, setUserInfo] = useState(null)
  const [searchParams, setSearchParams] = useState(null)

  useEffect(() => {
    // Get user info from session storage
    const authProvider = sessionStorage.getItem('authProvider')
    
    if (authProvider === 'google') {
      const googleUser = JSON.parse(sessionStorage.getItem('googleUser') || '{}')
      setUserInfo({
        provider: 'Google',
        name: googleUser.name,
        email: googleUser.email,
        picture: googleUser.picture
      })
    } else {
      setUserInfo({
        provider: 'Unknown',
        name: 'User',
        email: 'Not specified'
      })
    }

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
    if (!searchData.txtSubject || !searchData.txtTerm || !searchData.txtCourseNumber) {
      navigate('/course-search')
      return
    }

    // Perform the search
    performSearch(searchData)
  }, [location, navigate])

  const performSearch = async (searchData) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams(searchData)
      const res = await fetch(`${API_BASE}/api/courses/search?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: "application/json" },
      })

      if (!res.ok) {
        throw new Error(`Request failed with status: ${res.status}`)
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

  const handleLogout = () => {
    sessionStorage.removeItem('authProvider')
    sessionStorage.removeItem('googleUser')
    window.location.reload()
  }

  const handleNewSearch = () => {
    navigate('/course-search')
  }

  return (
    <>
      <header className="site-header">
        <div className="header-content">
          <h1>PantherWatch Web</h1>
          {userInfo && (
            <div className="user-info">
              <span>Welcome, {userInfo.name}</span>
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </div>
          )}
        </div>
      </header>
      <main>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <button onClick={handleNewSearch} style={{ marginBottom: '20px' }}>
              ← New Search
            </button>
            {searchParams && (
              <div style={{ 
                fontSize: '16px', 
                color: '#2c3e50', 
                marginBottom: '10px',
                fontWeight: '500'
              }}>
                Search: {searchParams.txtSubject} {searchParams.txtCourseNumber} - {getTermName(searchParams.txtTerm)}
              </div>
            )}
          </div>
          
          <CourseResults 
            courses={courses}
            loading={loading}
            error={error}
          />
        </div>
      </main>
    </>
  )
}

export default CourseResultsPage
