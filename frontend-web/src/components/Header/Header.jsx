import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../config/authService.js'
import './Header.css'

function Header({ onToggleSidebar }) {
  const navigate = useNavigate()
  const [userInfo, setUserInfo] = useState(null)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)

  useEffect(() => {
    // Get user info from backend authentication service
    const userInfo = authService.getUserInfo()
    setUserInfo(userInfo)
  }, [])

  const handleTitleClick = () => {
    navigate('/dashboard')
  }

  const handleProfileClick = () => {
    setShowProfileDropdown(!showProfileDropdown)
  }

  const handleLogout = () => {
    authService.logout()
    
    // Reload to go back to login
    window.location.reload()
  }

  const handleClickOutside = (e) => {
    if (!e.target.closest('.user-profile-container')) {
      setShowProfileDropdown(false)
    }
  }

  useEffect(() => {
    if (showProfileDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showProfileDropdown])

  return (
    <header className="app-header">
      <div className="header-left">
        <button 
          className="menu-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <span className="hamburger"></span>
          <span className="hamburger"></span>
          <span className="hamburger"></span>
        </button>
        <h1 className="app-title" onClick={handleTitleClick}>
          PantherWatch
        </h1>
      </div>
      
      <div className="header-right">
        {userInfo && (
          <div className="user-profile-container">
            <div className="user-avatar" onClick={handleProfileClick}>
              {userInfo.picture ? (
                <img 
                  src={userInfo.picture} 
                  alt={userInfo.name}
                  className="avatar-image"
                />
              ) : (
                <div className="avatar-placeholder">
                  {userInfo.firstName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            
            {showProfileDropdown && (
              <div className="profile-dropdown">
                <div className="profile-info">
                  <div className="profile-name">{userInfo.name}</div>
                  <div className="profile-email">{userInfo.email}</div>
                </div>
                <div className="dropdown-divider"></div>
                <button className="dropdown-logout" onClick={handleLogout}>
                  <span className="logout-icon">🚪</span>
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

export default Header
