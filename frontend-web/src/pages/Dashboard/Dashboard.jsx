import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import { useTutorial } from '../../hooks/useTutorial.js';
import Icon from '../../components/Icon';
import Tutorial from '../../components/Tutorial';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const { watchedCount, loading: watchedLoading } = useWatchedClasses();
  const { showTutorial, setShowTutorial, hasSeenTutorial, markTutorialAsSeen } = useTutorial();

  useEffect(() => {
    if (!hasSeenTutorial && userInfo) {
      const timer = setTimeout(() => setShowTutorial(true), 500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTutorial, userInfo, setShowTutorial]);

  const tutorialSteps = [
    {
      target: '.pw-kpi-grid',
      title: 'Welcome to PantherWatch!',
      description: 'This is your dashboard — a quick snapshot of everything you\'re tracking.',
      position: 'bottom',
    },
    {
      target: '[data-card="search"]',
      title: 'Course Search',
      description: 'Start here to search courses by term and subject with real-time seat counts.',
      position: 'top',
    },
    {
      target: '[data-card="tracked"]',
      title: 'Tracked Classes',
      description: 'All the sections you\'re monitoring. We email you the moment a seat opens.',
      position: 'top',
    },
    {
      target: '[data-card="schedule"]',
      title: 'Schedule Builder',
      description: 'Visualise your weekly schedule and export it when you\'re ready to register.',
      position: 'top',
    },
  ];

  const cards = [
    {
      id: 'search',
      icon: 'search',
      title: 'Course search',
      description: 'Filter by term, subject, and number. See live seat counts as you browse.',
      actionLabel: 'Search courses',
      onClick: () => navigate('/course-search'),
    },
    {
      id: 'tracked',
      icon: 'bookmark',
      title: 'Tracked classes',
      description: 'Review the sections you\'re monitoring and manage your watchlist anytime.',
      actionLabel: watchedCount > 0 ? 'Manage list' : 'Start tracking',
      badge: watchedLoading ? undefined : (watchedCount > 0 ? `${watchedCount} active` : undefined),
      onClick: () => navigate('/tracked-classes'),
    },
    {
      id: 'schedule',
      icon: 'calendar',
      title: 'Schedule builder',
      description: 'Plan your week visually. Add classes and export to your calendar.',
      actionLabel: 'View schedule',
      onClick: () => navigate('/schedule-builder'),
    },
  ];

  const greetingName = userInfo?.firstName || 'Panther';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="pw-dashboard">
      {showTutorial && (
        <Tutorial
          steps={tutorialSteps}
          onComplete={markTutorialAsSeen}
          onSkip={markTutorialAsSeen}
        />
      )}

      {/* Page heading */}
      <div className="pw-page-head">
        <div>
          <div className="pw-meta">// {today}</div>
          <h1>Welcome back, {greetingName}.</h1>
          <p className="pw-subtitle">
            Here's what's happening with your tracked classes at Georgia State.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="pw-kpi-grid">
        <div className="pw-kpi">
          <div className="pw-kpi-label">Tracked classes</div>
          <div className="pw-kpi-val">
            {watchedLoading ? '—' : watchedCount}
          </div>
          <div className="pw-kpi-meta">Active watchlist</div>
        </div>
        <div className="pw-kpi">
          <div className="pw-kpi-label">Monitoring</div>
          <div className="pw-kpi-val">
            Live <span className="pw-kpi-delta">↑</span>
          </div>
          <div className="pw-kpi-meta">GoSOLAR checked regularly</div>
        </div>
        <div className="pw-kpi">
          <div className="pw-kpi-label">Get notified</div>
          <div className="pw-kpi-val">Email</div>
          <div className="pw-kpi-meta">Instant alerts on seat opens</div>
        </div>
      </div>

      {/* Action cards */}
      <div className="pw-section-head" style={{ marginTop: 0 }}>
        <h2>Where do you want to go?</h2>
      </div>

      <div className="pw-dash-cards">
        {cards.map((card) => (
          <article
            key={card.id}
            className="pw-dash-card"
            data-card={card.id}
            onClick={card.onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && card.onClick()}
          >
            <div className="pw-dash-card-icon">
              <Icon name={card.icon} size={18} aria-hidden />
            </div>

            <div>
              <h3 className="pw-dash-card-title">{card.title}</h3>
              <p className="pw-dash-card-desc">{card.description}</p>
            </div>

            <div className="pw-dash-card-footer">
              {card.badge && (
                <span className="pw-dash-card-badge">{card.badge}</span>
              )}
              <span className="pw-dash-card-action">
                {card.actionLabel}
                <Icon name="arrow" size={13} aria-hidden />
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
