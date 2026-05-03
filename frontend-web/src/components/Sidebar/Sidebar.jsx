import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import Icon from '../Icon';
import { adminService } from '../../config/adminService';
import './Sidebar.css';

function Sidebar({ isOpen, currentPath, onNavigate, onClose }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const { userInfo } = useAuth();
  const { watchedCount } = useWatchedClasses();

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const adminStatus = await adminService.checkAdminStatus();
      setIsAdmin(adminStatus);
    } catch {
      setIsAdmin(false);
    }
  };

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard',       path: '/dashboard',       icon: 'dashboard' },
    { id: 'search',    label: 'Course search',   path: '/course-search',   icon: 'search'    },
    { id: 'tracked',   label: 'Tracked classes', path: '/tracked-classes', icon: 'bookmark', count: watchedCount },
    { id: 'schedule',  label: 'Schedule',        path: '/schedule-builder', icon: 'calendar' },
  ];

  if (isAdmin) {
    navigationItems.push({
      id: 'admin', label: 'Admin Panel', path: '/admin', icon: 'admin',
    });
  }

  const handleNavigate = (path) => {
    onNavigate(path);
    onClose();
  };

  // Build initials from userInfo
  const firstInitial = userInfo?.firstName ? userInfo.firstName.charAt(0).toUpperCase() : '';
  const lastInitial  = userInfo?.lastName  ? userInfo.lastName.charAt(0).toUpperCase()  : '';
  const initials     = (firstInitial + lastInitial).trim() || '?';
  const displayName  = userInfo?.firstName
    ? `${userInfo.firstName}${lastInitial ? ` ${lastInitial}.` : ''}`
    : (userInfo?.name || 'Panther');

  return (
    <aside className={`pw-sidebar ${isOpen ? 'open' : ''}`} aria-label="Primary navigation">
      {/* Brand */}
      <div className="pw-brand">
        <div className="pw-brand-mark" />
        <span className="pw-brand-name">PantherWatch</span>
      </div>

      {/* Workspace / user */}
      <div className="pw-workspace">
        <div className="pw-workspace-avatar">{initials}</div>
        <span className="pw-workspace-name">{displayName}</span>
      </div>

      {/* Main navigation */}
      <div className="pw-nav-section">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`pw-nav-item ${currentPath === item.path ? 'active' : ''} ${item.id === 'admin' ? 'admin-item' : ''}`}
            onClick={() => handleNavigate(item.path)}
          >
            <Icon name={item.icon} size={15} className="pw-nav-ico" aria-hidden />
            <span>{item.label}</span>
            {item.count > 0 && (
              <span className="pw-nav-badge">{item.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="pw-sidebar-foot">
        <button
          type="button"
          className={`pw-nav-item ${currentPath === '/settings' ? 'active' : ''}`}
          onClick={() => handleNavigate('/settings')}
        >
          <Icon name="settings" size={15} className="pw-nav-ico" aria-hidden />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
