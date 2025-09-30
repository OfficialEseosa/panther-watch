import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../config/authService.js';
import { useTheme } from '../../contexts/ThemeContext';
import CachedAvatar from '../CachedAvatar';
import Icon from '../Icon';
import pantherLogo from '../../assets/panther.png';
import './Header.css';

function Header({ onToggleSidebar }) {
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const handleTitleClick = () => {
    navigate('/dashboard');
  };

  const handleProfileClick = () => {
    setShowProfileDropdown((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      navigate('/login', { replace: true });
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.reload();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.user-profile-container')) {
        setShowProfileDropdown(false);
      }
    };

    if (showProfileDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showProfileDropdown]);

  const firstInitial = userInfo?.firstName ? userInfo.firstName.charAt(0).toUpperCase() : '';
  const lastInitial = userInfo?.lastName ? userInfo.lastName.charAt(0).toUpperCase() : '';
  const displayName = userInfo?.firstName
    ? `${userInfo.firstName}${lastInitial ? ` ${lastInitial}.` : ''}`
    : userInfo?.name;
  const initials = (firstInitial + lastInitial).trim() || '?';
  const isDark = theme === 'dark';
  const themeLabel = isDark ? 'Light mode' : 'Dark mode';
  const themeIcon = isDark ? 'sun' : 'moon';

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="menu-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <span className="hamburger"></span>
          <span className="hamburger"></span>
          <span className="hamburger"></span>
        </button>
        <button type="button" className="title-button" onClick={handleTitleClick}>
          <img src={pantherLogo} alt="PantherWatch" className="app-logo" />
          <div className="title-text">
            <span className="app-name">PantherWatch</span>
            <span className="app-tagline">Georgia State monitoring suite</span>
          </div>
        </button>
      </div>

      <div className="header-right">
        {userInfo && (
          <div className="user-profile-container">
            <button type="button" className="user-trigger" onClick={handleProfileClick}>
              <span className="avatar-wrapper">
                <CachedAvatar
                  src={userInfo.picture}
                  alt={userInfo.name}
                  fallbackText={initials}
                  className="avatar-image"
                />
              </span>
              <span className="user-meta">
                <span className="user-name">{displayName}</span>
                <span className="user-email">{userInfo.email}</span>
              </span>
              <Icon
                name="chevronDown"
                size={16}
                className={`user-chevron ${showProfileDropdown ? 'open' : ''}`}
                aria-hidden
              />
            </button>

            {showProfileDropdown && (
              <div className="profile-dropdown">
                <div className="profile-info">
                  <div className="profile-name">{userInfo.name}</div>
                  <div className="profile-email">{userInfo.email}</div>
                </div>
                <div className="profile-actions">
                  <button
                    type="button"
                    className="dropdown-action dropdown-theme"
                    onClick={toggleTheme}
                  >
                    <Icon name={themeIcon} size={18} className="dropdown-icon" aria-hidden />
                    {themeLabel}
                  </button>
                  <button type="button" className="dropdown-action dropdown-logout" onClick={handleLogout}>
                    <Icon name="logout" size={18} className="dropdown-icon" aria-hidden />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
