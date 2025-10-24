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
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTutorial, userInfo, setShowTutorial]);

  const tutorialSteps = [
    {
      target: '.dashboard-header',
      title: 'Welcome to PantherWatch!',
      description: 'This is your dashboard where you can see an overview of your tracked classes and quick access to key features.',
      position: 'bottom'
    },
    {
      target: '.tracked-summary',
      title: 'Track Your Classes',
      description: 'Keep an eye on how many classes you\'re currently tracking. This number updates in real-time as you add or remove courses.',
      position: 'bottom'
    },
    {
      target: '[data-card="search"]',
      title: 'Course Search',
      description: 'Start here to search for courses by term and subject. You\'ll see real-time seat availability for all courses at Georgia State.',
      position: 'top'
    },
    {
      target: '[data-card="tracked"]',
      title: 'Your Tracked Classes',
      description: 'View and manage all the classes you\'re monitoring. Get notifications when seats become available in your tracked courses.',
      position: 'top'
    },
    {
      target: '[data-card="schedule"]',
      title: 'Schedule Builder',
      description: 'Plan your weekly schedule visually. Add classes to see how they fit together and export your schedule when ready.',
      position: 'top'
    }
  ];

  const handleTutorialComplete = () => {
    markTutorialAsSeen();
  };

  const handleTutorialSkip = () => {
    markTutorialAsSeen();
  };

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
      id: 'schedule',
      icon: 'calendar',
      title: 'Class schedule',
      description: 'View and manage your weekly class schedule with calendar export.',
      actionLabel: 'View schedule',
      onClick: () => navigate('/schedule-builder')
    }
  ];

  const greetingName = userInfo?.firstName || 'Panther';

  return (
    <div className="dashboard">
      {showTutorial && (
        <Tutorial
          steps={tutorialSteps}
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}
      
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
            <span className="summary-value">{watchedLoading ? '…' : watchedCount}</span>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        {cards.map((card) => (
          <article key={card.id} className={`dashboard-card ${card.disabled ? 'disabled' : ''}`} data-card={card.id}>
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
