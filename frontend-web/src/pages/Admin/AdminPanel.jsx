import { useState, useEffect, useCallback } from 'react'
import Icon from '../../components/Icon'
import UserSearchSection from '../../components/AdminPanel/UserSearch'
import { EmailComposer } from '../../components/AdminPanel/EmailComposer'
import { AnnouncementManager } from '../../components/AdminPanel/AnnouncementManager'
import AdminStats from '../../components/AdminPanel/Stats'
import { adminService } from '../../config/adminService'
import './AdminPanel.css'

function AdminPanel() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('stats')
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [showEmailComposer, setShowEmailComposer] = useState(false)

  const loadAllUsers = useCallback(async () => {
    try {
      const allUsers = await adminService.getAllUsers()
      setUsers(allUsers)
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }, [])

  const checkAdminStatus = useCallback(async () => {
    try {
      const adminStatus = await adminService.checkAdminStatus()
      setIsAdmin(adminStatus)

      if (adminStatus) {
        await loadAllUsers()
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }, [loadAllUsers])

  useEffect(() => {
    checkAdminStatus()
  }, [checkAdminStatus])

  const handleUserSearch = async (query) => {
    try {
      if (query.trim() === '') {
        await loadAllUsers()
      } else {
        const searchResults = await adminService.searchUsers(query)
        setUsers(searchResults)
      }
    } catch (error) {
      console.error('Error searching users:', error)
    }
  }

  const handleSendEmail = (user) => {
    setSelectedUser(user)
    setShowEmailComposer(true)
  }

  const handleEmailSent = () => {
    setShowEmailComposer(false)
    setSelectedUser(null)
  }

  if (loading) {
    return (
      <div className="admin-panel loading" role="status" aria-live="polite">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Checking admin access...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-panel unauthorized">
        <div className="unauthorized-content">
          <Icon name="shieldOff" size={56} className="unauthorized-icon" aria-hidden />
          <h1>Access denied</h1>
          <p>You do not have permission to access the admin panel.</p>
          <p>Only authorized administrators can view this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="admin-heading">
          <Icon name="admin" size={28} className="admin-heading-icon" aria-hidden />
          <div>
            <h1>Admin panel</h1>
            <p>Manage users, insights, announcements, and outbound messaging.</p>
          </div>
        </div>
      </header>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <Icon name="stats-chart" />
          Statistics
        </button>
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Icon name="people" />
          Users
        </button>
        <button
          className={`admin-tab ${activeTab === 'announcements' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcements')}
        >
          <Icon name="notifications" />
          Announcements
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'stats' && (
          <section className="admin-section">
            <AdminStats users={users} />
          </section>
        )}

        {activeTab === 'users' && (
          <section className="admin-section">
            <UserSearchSection
              users={users}
              onSearch={handleUserSearch}
              onSendEmail={handleSendEmail}
            />
          </section>
        )}

        {activeTab === 'announcements' && (
          <section className="admin-section">
            <AnnouncementManager />
          </section>
        )}

        {showEmailComposer && (
          <EmailComposer
            user={selectedUser}
            onCancel={() => setShowEmailComposer(false)}
            onEmailSent={handleEmailSent}
          />
        )}
      </div>
    </div>
  )
}

export default AdminPanel
