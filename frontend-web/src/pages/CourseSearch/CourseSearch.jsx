import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildApiUrl } from '../../config'
import '../../App.css'
import './CourseSearch.css'

function CourseSearch() {
  const navigate = useNavigate()
  const [value, setValue] = useState({
    txtLevel: '',
    txtSubject: '',
    txtTerm: '',
    txtCourseNumber: ''
  })
  const [userInfo, setUserInfo] = useState(null)
  const [terms, setTerms] = useState([])
  const [termsLoading, setTermsLoading] = useState(true)
  const [termsError, setTermsError] = useState(null)

  // Fetch available terms from API
  useEffect(() => {
    const fetchTerms = async () => {
      try {
        setTermsLoading(true)
        const response = await fetch(buildApiUrl('/courses/terms'))
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const termsData = await response.json()
        setTerms(termsData)
        setTermsError(null)
      } catch (error) {
        console.error('Error fetching terms:', error)
        setTermsError('Failed to load terms')
        setTerms([])
      } finally {
        setTermsLoading(false)
      }
    }

    fetchTerms()
  }, [])

  // Get user info from session storage on component mount
  useEffect(() => {
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
      // Default user info (could be Microsoft or manual login)
      setUserInfo({
        provider: 'Unknown',
        name: 'User',
        email: 'Not specified'
      })
    }
  }, [])

  const handleChanges = (e) => {
    setValue({...value, [e.target.name]: e.target.value})
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Form submitted with values:', value);
    
    const params = new URLSearchParams(value);
    navigate(`/course-results?${params.toString()}`);
  }

  const handleLogout = () => {
    // Clear session storage
    sessionStorage.removeItem('authProvider')
    sessionStorage.removeItem('googleUser')
    
    // Reload to go back to login
    window.location.reload()
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
          <form onSubmit={handleSubmit}>
            <label htmlFor="txtLevel">Choose a degree: </label>
            <select id="txtLevel" name="txtLevel" onChange={(e) => handleChanges(e)} required>
              <option value="">-- Select a degree --</option>
              <option value="US">Bachelors (4 Year)</option>
            </select>

            <label htmlFor="txtSubject">Enter a subject:</label>
            <input id="txtSubject" name="txtSubject" type="text" placeholder="e.g. CSC" onChange={handleChanges} required />

            <label htmlFor="txtTerm">Choose a term: </label>
            <select id="txtTerm" name="txtTerm" onChange={(e) => handleChanges(e)} required>
              <option value="">-- Select a term --</option>
              {termsLoading && <option disabled>Loading terms...</option>}
              {termsError && <option disabled>Error loading terms</option>}
              {!termsLoading && !termsError && terms.map(term => (
                <option key={term.code} value={term.code}>
                  {term.description}
                </option>
              ))}
            </select>

            <label htmlFor="txtCourseNumber">Enter a course number:</label>
            <input id="txtCourseNumber" name="txtCourseNumber" type="text" placeholder="e.g. 2720" onChange={handleChanges} required />

            <button type="submit">Submit</button>
          </form>
        </div>
      </main>
    </>
  )
}

export default CourseSearch
