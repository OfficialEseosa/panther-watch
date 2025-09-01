import './AdminStats.css'

function AdminStats({ users }) {
  const totalUsers = users.length
  const activeUsers = users.filter(user => user.watchedClassesCount > 0).length
  const totalWatchedClasses = users.reduce((sum, user) => sum + user.watchedClassesCount, 0)
  const avgWatchedClasses = totalUsers > 0 ? (totalWatchedClasses / totalUsers).toFixed(1) : 0

  const stats = [
    {
      label: 'Total Users',
      value: totalUsers,
      icon: '👥',
      color: '#667eea'
    },
    {
      label: 'Active Users',
      value: activeUsers,
      icon: '🔥',
      color: '#10b981'
    },
    {
      label: 'Total Watched Classes',
      value: totalWatchedClasses,
      icon: '📚',
      color: '#f59e0b'
    },
    {
      label: 'Avg Classes per User',
      value: avgWatchedClasses,
      icon: '📊',
      color: '#8b5cf6'
    }
  ]

  return (
    <div className="admin-stats">
      <h2 className="stats-title">📊 System Overview</h2>
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card" style={{ borderTopColor: stat.color }}>
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}20`, color: stat.color }}>
              {stat.icon}
            </div>
            <div className="stat-content">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AdminStats
