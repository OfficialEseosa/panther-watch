import { useState, useEffect } from 'react'
import '../../App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

function CourseSearch() {
  const [value, setValue] = useState({
    txtLevel: '',
    txtSubject: '',
    txtTerm: '',
    txtCourseNumber: ''
  })
  const [userInfo, setUserInfo] = useState(null)

  // Get user info from session storage on component mount
  useEffect(() => {
    const authProvider = sessionStorage.getItem('authProvider')
    
    if (authProvider === 'google') {
      const googleUser = JSON.parse(sessionStorage.getItem('googleUser') || '{}')
      const gsuEmail = sessionStorage.getItem('gsuEmail')
      setUserInfo({
        provider: 'Google',
        name: googleUser.name,
        email: googleUser.email,
        gsuEmail: gsuEmail,
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

    try {
      const params = new URLSearchParams(value);
      const res = await fetch(`${API_BASE}/api/courses/search?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Request failed with status: ${res.status}`);
      }

      const json = await res.json();
      console.log("Response data:", json);
    } catch (err) {
      console.error("An error occurred:", err);
    } finally {
    }
  }

  const handleLogout = () => {
    // Clear session storage
    sessionStorage.removeItem('authProvider')
    sessionStorage.removeItem('googleUser')
    sessionStorage.removeItem('gsuEmail')
    
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
              {userInfo.gsuEmail && (
                <span className="gsu-email">({userInfo.gsuEmail})</span>
              )}
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
              <option value="202508">Fall Semester 2025</option>
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
