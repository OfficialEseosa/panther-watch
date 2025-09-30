import { useState, useEffect } from 'react';
import Icon from '../Icon';
import { adminService } from '../../config/adminService';
import './Sidebar.css';

function Sidebar({ isOpen, currentPath, onNavigate, onClose }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const adminStatus = await adminService.checkAdminStatus();
      setIsAdmin(adminStatus);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    }
  };

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard',
      icon: 'dashboard'
    },
    {
      id: 'search',
      label: 'Course Search',
      path: '/course-search',
      icon: 'search'
    },
    {
      id: 'tracked',
      label: 'Tracked Classes',
      path: '/tracked-classes',
      icon: 'bookmark'
    }
  ];

  if (isAdmin) {
    navigationItems.push({
      id: 'admin',
      label: 'Admin Panel',
      path: '/admin',
      icon: 'admin'
    });
  }

  const handleNavigate = (path, comingSoon = false) => {
    if (comingSoon) {
      alert('This feature is coming soon!');
      return;
    }

    onNavigate(path);
    onClose();
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose}></div>}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Primary navigation">
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.id} className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${currentPath === item.path ? 'active' : ''}`}
                  onClick={() => handleNavigate(item.path, item.comingSoon)}
                  data-admin={item.id === 'admin' ? 'true' : undefined}
                >
                  <Icon name={item.icon} size={18} className="nav-icon" aria-hidden />
                  <span className="nav-label">{item.label}</span>
                  {item.comingSoon && <span className="badge">Soon</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
