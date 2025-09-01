import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../config/authService.js'
import { watchedClassService } from '../../config/watchedClassService.js'
import './Dashboard.css'

function Dashboard() {
  const navigate = useNavigate()
  const [userInfo, setUserInfo] = useState(null)
  const [watchedCount, setWatchedCount] = useState(0)

  useEffect(() => {
    // Get user info from backend authentication service
    const loadUserInfo = async () => {
      try {
        const userInfo = await authService.getUserInfo()
        setUserInfo(userInfo)
      } catch (error) {
        console.error('Failed to load user info:', error)
      }
    }
    loadUserInfo()
    
    // Get watched classes count
    const loadWatchedCount = async () => {
      try {
        const count = await watchedClassService.getWatchedClassCount()
        setWatchedCount(count)
      } catch (error) {
        console.error('Failed to load watched classes count:', error)
      }
    }
    
    if (userInfo) {
      loadWatchedCount()
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

        <div className="dashboard-card" onClick={() => navigate('/tracked-classes')}>
          <div className="card-icon">📚</div>
          <h3 className="card-title">Tracked Classes</h3>
          <p className="card-description">
            You're tracking {watchedCount} {watchedCount === 1 ? 'class' : 'classes'}
          </p>
          {watchedCount > 0 && <span className="active-badge">Active</span>}
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
