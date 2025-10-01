import Icon from '../../Icon'

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
    <article className={`user-card ${isSelected ? 'selected' : ''}`}>
      <header className="user-card-header">
        <div className="user-avatar" aria-hidden>
          {user.picture ? (
            <img src={user.picture} alt="" />
          ) : (
            <div className="avatar-placeholder">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="user-info">
          <h3 className="user-name">{user.name || user.email.split('@')[0]}</h3>
          <p className="user-email">{user.email}</p>
        </div>
        <label className="user-checkbox">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            aria-label={isSelected ? 'Deselect user' : 'Select user'}
          />
          <span className="checkmark">
            <Icon name="check" size={11} aria-hidden />
          </span>
        </label>
      </header>

      <dl className="user-stats">
        <div className="stat-item">
          <dt className="sr-only">Watched classes</dt>
          <Icon name="bookmark" size={14} className="stat-icon" aria-hidden />
          <dd className="stat-text">{user.watchedClassesCount} watched classes</dd>
        </div>
        <div className="stat-item">
          <dt className="sr-only">Joined</dt>
          <Icon name="calendar" size={14} className="stat-icon" aria-hidden />
          <dd className="stat-text">Joined {formatDate(user.createdAt)}</dd>
        </div>
      </dl>

      <div className="user-actions">
        <button type="button" className="send-email-btn" onClick={onSendEmail}>
          <Icon name="mail" size={16} aria-hidden />
          Send email
        </button>
      </div>
    </article>
  )
}

export default UserCard

