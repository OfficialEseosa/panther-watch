import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'
import Header from '../../components/Header'
import './DashboardLayout.css'

function DashboardLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  return (
    <div className="dashboard-layout">
      <Header onToggleSidebar={toggleSidebar} />
      
      <div className="dashboard-content">
        <Sidebar 
          isOpen={sidebarOpen}
          currentPath={location.pathname}
          onNavigate={navigate}
          onClose={() => setSidebarOpen(false)}
        />
        
        <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="content-wrapper">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
