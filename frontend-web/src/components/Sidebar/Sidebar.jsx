import './Sidebar.css'

const navigationItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: '🏠'
  },
  {
    id: 'search',
    label: 'Search for Classes',
    path: '/course-search',
    icon: '🔍'
  },
  {
    id: 'tracked',
    label: 'View Tracked Classes',
    path: '/tracked-classes',
    icon: '📚'
  }
]

function Sidebar({ isOpen, currentPath, onNavigate, onClose }) {
  const handleNavigate = (path, comingSoon = false) => {
    if (comingSoon) {
      // For now, just show an alert
      alert('This feature is coming soon!')
      return
    }
    
    onNavigate(path)
    onClose() // Close sidebar on mobile after navigation
  }

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose}></div>}
      
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.id} className="nav-item">
                <button
                  className={`nav-link ${currentPath === item.path ? 'active' : ''} ${item.comingSoon ? 'coming-soon' : ''}`}
                  onClick={() => handleNavigate(item.path, item.comingSoon)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">
                    {item.label}
                    {item.comingSoon && <span className="badge">Soon</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
