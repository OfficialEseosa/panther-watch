import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useWatchedClasses } from '../../contexts/WatchedClassesContext'
import './Dashboard.css'

function Dashboard() {
  const navigate = useNavigate()
  const { userInfo, loading: authLoading } = useAuth()
  const { watchedCount, loading: watchedLoading } = useWatchedClasses()

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
