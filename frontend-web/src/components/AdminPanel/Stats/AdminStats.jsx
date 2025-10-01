import Icon from '../../Icon'
import './AdminStats.css'

function AdminStats({ users }) {
  const totalUsers = users.length
  const activeUsers = users.filter(user => user.watchedClassesCount > 0).length
  const totalWatchedClasses = users.reduce((sum, user) => sum + user.watchedClassesCount, 0)
  const avgWatchedClasses = totalUsers > 0 ? (totalWatchedClasses / totalUsers).toFixed(1) : 0

  const stats = [
    {
      label: 'Total users',
      value: totalUsers,
      icon: 'users',
      tone: 'primary'
    },
    {
      label: 'Active users',
      value: activeUsers,
      icon: 'userCheck',
      tone: 'success'
    },
    {
      label: 'Total watched classes',
      value: totalWatchedClasses,
      icon: 'bookmark',
      tone: 'warning'
    },
    {
      label: 'Avg classes per user',
      value: avgWatchedClasses,
      icon: 'gauge',
      tone: 'accent'
    }
  ]

  return (
    <section className="admin-stats" aria-labelledby="admin-stats-title">
      <header className="stats-header">
        <Icon name="analytics" size={22} className="stats-header-icon" aria-hidden />
        <h2 id="admin-stats-title" className="stats-title">System overview</h2>
      </header>

      <div className="stats-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`stat-card tone-${stat.tone}`}>
            <div className="stat-icon">
              <Icon name={stat.icon} size={28} strokeWidth={1.6} aria-hidden />
            </div>
            <div className="stat-content">
              <p className="stat-label">{stat.label}</p>
              <p className="stat-value">{stat.value}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default AdminStats
