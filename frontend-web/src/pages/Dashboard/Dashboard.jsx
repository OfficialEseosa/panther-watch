import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import Icon from '../../components/Icon';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const { watchedCount, loading: watchedLoading } = useWatchedClasses();

  const cards = [
    {
      id: 'search',
      icon: 'search',
      title: 'Course search',
      description: 'Filter by term, subject, and course details with real-time availability.',
      actionLabel: 'Search courses',
      onClick: () => navigate('/course-search')
    },
    {
      id: 'tracked',
      icon: 'bookmark',
      title: 'Tracked classes',
      description: 'Review the sections you are monitoring and adjust alerts anytime.',
      actionLabel: watchedCount > 0 ? 'Manage tracked list' : 'Start tracking',
      badge: watchedLoading ? undefined : `${watchedCount} active`,
      onClick: () => navigate('/tracked-classes')
    },
    {
      id: 'analytics',
      icon: 'analytics',
      title: 'Insights & reports',
      description: 'Usage analytics, notification history, and seat trends (coming soon).',
      actionLabel: 'In development',
      disabled: true
    }
  ];

  const greetingName = userInfo?.firstName || 'Panther';

  return (
    <div className="dashboard">
      <section className="dashboard-header">
        <div className="header-copy">
          <span className="eyebrow">Overview</span>
          <h1 className="dashboard-title">Welcome back, {greetingName}.</h1>
          <p className="dashboard-subtitle">
            Keep an eye on enrollment and act quickly when seats open across Georgia State courses.
          </p>
        </div>

        <div className="tracked-summary" aria-live="polite">
          <div className="summary-icon">
            <Icon name="bookmark" size={26} aria-hidden />
          </div>
          <div className="summary-content">
            <span className="summary-label">Tracked classes</span>
            <span className="summary-value">{watchedLoading ? '—' : watchedCount}</span>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        {cards.map((card) => (
          <article key={card.id} className={`dashboard-card ${card.disabled ? 'disabled' : ''}`}>
            <div className="card-icon">
              <Icon name={card.icon} size={28} aria-hidden />
            </div>
            <h3 className="card-title">{card.title}</h3>
            <p className="card-description">{card.description}</p>

            <div className="card-footer">
              {card.badge && <span className="card-badge">{card.badge}</span>}
              <button
                type="button"
                className="card-button"
                onClick={card.onClick}
                disabled={card.disabled}
              >
                {card.actionLabel}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default Dashboard;
