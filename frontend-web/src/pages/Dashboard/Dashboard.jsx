import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

function Dashboard() {
  const navigate = useNavigate()
  const [userInfo, setUserInfo] = useState(null)

  useEffect(() => {
    // Get user info from session storage
    const authProvider = sessionStorage.getItem('authProvider')
    
    if (authProvider === 'google') {
      const googleUser = JSON.parse(sessionStorage.getItem('googleUser') || '{}')
      setUserInfo({
        provider: 'Google',
        name: googleUser.name,
        email: googleUser.email,
        picture: googleUser.picture,
        firstName: googleUser.name?.split(' ')[0] || 'User'
      })
    } else {
      setUserInfo({
        provider: 'Unknown',
        name: 'User',
        email: 'Not specified',
        firstName: 'User'
      })
    }
  }, [])

  const handleNavigateToSearch = () => {
    navigate('/course-search')
  }

  return (
    <div className="dashboard">
      <div className="welcome-section">
        <div className="welcome-content">
          <div className="welcome-text">
            <h1 className="welcome-title">
              Welcome, {userInfo?.firstName || 'User'}!
            </h1>
            <p className="welcome-subtitle">
              Ready to search for your classes?
            </p>
          </div>
        </div>
      </div>

      <div className="dashboard-cards">
        <div className="dashboard-card clickable" onClick={handleNavigateToSearch}>
          <div className="card-icon">🔍</div>
          <h3 className="card-title">Search for Classes</h3>
          <p className="card-description">
            Find and explore available courses for the semester
          </p>
        </div>

        <div className="dashboard-card coming-soon">
          <div className="card-icon">📚</div>
          <h3 className="card-title">Tracked Classes</h3>
          <p className="card-description">
            Keep track of your favorite classes and get notifications
          </p>
          <span className="coming-soon-badge">Coming Soon</span>
        </div>

        <div className="dashboard-card coming-soon">
          <div className="card-icon">📊</div>
          <h3 className="card-title">Analytics</h3>
          <p className="card-description">
            View your search history and class statistics
          </p>
          <span className="coming-soon-badge">Coming Soon</span>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
