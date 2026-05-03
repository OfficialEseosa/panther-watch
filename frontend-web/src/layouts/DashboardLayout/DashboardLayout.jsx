import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'
import Header from '../../components/Header'
import { AnnouncementBanner } from '../../components/AnnouncementBanner'
import './DashboardLayout.css'

function DashboardLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="pw-layout">
      {/* Mobile backdrop */}
      <div
        className={`pw-sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
        onClick={closeSidebar}
      />

      <Sidebar
        isOpen={sidebarOpen}
        currentPath={location.pathname}
        onNavigate={navigate}
        onClose={closeSidebar}
      />

      <div className="pw-main">
        <Header onToggleSidebar={toggleSidebar} />
        <AnnouncementBanner />
        <div className="pw-scroll">
          {children}
        </div>
      </div>
    </div>
  )
}

export default DashboardLayout
