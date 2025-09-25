import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import CachedAvatar from '../CachedAvatar'
import pantherLogo from '../../assets/panther.png'
import './Header.css'

function Header({ onToggleSidebar }) {
  const navigate = useNavigate()
  const { userInfo, loading: authLoading } = useAuth()
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)

  const handleTitleClick = () => {
    navigate('/dashboard')
  }

  const handleProfileClick = () => {
    setShowProfileDropdown(!showProfileDropdown)
  }

  const handleLogout = async () => {
    try {
      await authService.logout()
      window.location.reload()
    } catch (error) {
      console.error('Logout failed:', error)
      window.location.reload()
    }
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
          <img src={pantherLogo} alt="PantherWatch" className="app-logo" />
          PantherWatch
        </h1>
      </div>
      
      <div className="header-right">
        {userInfo && (
          <div className="user-profile-container">
            <div className="user-avatar" onClick={handleProfileClick}>
              <CachedAvatar
                src={userInfo.picture}
                alt={userInfo.name}
                fallbackText={userInfo.firstName.charAt(0).toUpperCase()}
                className="avatar-image"
              />
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
