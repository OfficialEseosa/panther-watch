import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { authService } from '../../config/authService.js';
import CachedAvatar from '../CachedAvatar';
import Icon from '../Icon';
import './Header.css';

const PAGE_LABELS = {
  '/dashboard':      'Dashboard',
  '/course-search':  'Course search',
  '/course-results': 'Course results',
  '/tracked-classes':'Tracked classes',
  '/schedule-builder':'Schedule builder',
  '/settings':       'Settings',
  '/admin':          'Admin panel',
};

function Header({ onToggleSidebar }) {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { userInfo } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  const pageLabel = PAGE_LABELS[location.pathname] ?? 'PantherWatch';

  const handleLogout = async () => {
    try {
      await authService.logout();
      navigate('/', { replace: true });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
    setShowDropdown(false);
  };

  useEffect(() => {
    if (!showDropdown) return;
    const close = (e) => {
      if (!e.target.closest('.pw-user-profile')) setShowDropdown(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showDropdown]);

  const firstInitial = userInfo?.firstName ? userInfo.firstName.charAt(0).toUpperCase() : '';
  const lastInitial  = userInfo?.lastName  ? userInfo.lastName.charAt(0).toUpperCase()  : '';
  const displayName  = userInfo?.firstName
    ? `${userInfo.firstName}${lastInitial ? ` ${lastInitial}.` : ''}`
    : (userInfo?.name || '');
  const initials = (firstInitial + lastInitial).trim() || '?';

  return (
    <div className="pw-topbar">
      {/* Mobile hamburger */}
      <button
        type="button"
        className="pw-menu-toggle"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <span className="pw-hamburger" />
        <span className="pw-hamburger" />
        <span className="pw-hamburger" />
      </button>

      {/* Desktop breadcrumb */}
      <div className="pw-crumb">
        <span>PantherWatch</span>
        <span className="pw-sep">/</span>
        <b>{pageLabel}</b>
      </div>

      {/* Mobile brand */}
      <div className="pw-mobile-brand">
        <div className="pw-mobile-brand-mark" />
        PantherWatch
      </div>

      {/* Right: icon actions + profile */}
      <div className="pw-topbar-right">
        {userInfo && (
          <div className="pw-user-profile">
            <button
              type="button"
              className="pw-user-trigger"
              onClick={() => setShowDropdown((p) => !p)}
              aria-label="User menu"
            >
              <div className="pw-user-avatar-wrap">
                <CachedAvatar
                  src={userInfo.picture}
                  alt={userInfo.name}
                  fallbackText={initials}
                  className="avatar-image"
                />
              </div>
              <span className="pw-user-name">{displayName}</span>
              <Icon
                name="chevronDown"
                size={12}
                className={`pw-user-chevron ${showDropdown ? 'open' : ''}`}
                aria-hidden
              />
            </button>

            {showDropdown && (
              <div className="pw-profile-dropdown">
                <div className="pw-profile-info">
                  <div className="pw-profile-name">{userInfo.name}</div>
                  <div className="pw-profile-email">{userInfo.email}</div>
                </div>
                <div className="pw-dropdown-actions">
                  <button
                    type="button"
                    className="pw-dropdown-btn"
                    onClick={handleSettingsClick}
                  >
                    <Icon name="settings" size={15} aria-hidden />
                    Settings
                  </button>
                  <button
                    type="button"
                    className="pw-dropdown-btn logout"
                    onClick={handleLogout}
                  >
                    <Icon name="logout" size={15} aria-hidden />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Header;
