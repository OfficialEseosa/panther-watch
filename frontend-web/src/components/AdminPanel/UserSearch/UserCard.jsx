function UserCard({ user, isSelected, onSelect, onSendEmail }) {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className={`user-card ${isSelected ? 'selected' : ''}`}>
      <div className="user-card-header">
        <div className="user-avatar">
          {user.picture ? (
            <img src={user.picture} alt={user.name || user.email} />
          ) : (
            <div className="avatar-placeholder">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="user-info">
          <h3 className="user-name">
            {user.name || user.email.split('@')[0]}
          </h3>
          <p className="user-email">{user.email}</p>
        </div>
        <label className="user-checkbox">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
          />
          <span className="checkmark"></span>
        </label>
      </div>
      
      <div className="user-stats">
        <div className="stat-item">
          <span className="stat-icon">📚</span>
          <span className="stat-text">
            {user.watchedClassesCount} watched classes
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">📅</span>
          <span className="stat-text">
            Joined {formatDate(user.createdAt)}
          </span>
        </div>
      </div>

      <div className="user-actions">
        <button
          className="send-email-btn"
          onClick={onSendEmail}
        >
          📧 Send Email
        </button>
      </div>
    </div>
  )
}

export default UserCard
