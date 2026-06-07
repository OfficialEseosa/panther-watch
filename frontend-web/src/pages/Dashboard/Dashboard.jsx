import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import { useTutorial } from '../../hooks/useTutorial.js';
import { authService } from '../../config/authService.js';
import Icon from '../../components/Icon';
import Tutorial from '../../components/Tutorial';
import WhatsNewShowcase from '../../components/WhatsNew';
import './Dashboard.css';

const WHATS_NEW_KEY = 'pantherwatch_whatsnew_v1_seen';

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userInfo, isAuthenticated, loading: authLoading } = useAuth();
  const { watchedCount, loading: watchedLoading } = useWatchedClasses();
  const { showTutorial, setShowTutorial, hasSeenTutorial, markTutorialAsSeen } = useTutorial();
  const isGuest = !authLoading && !isAuthenticated;
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Show the "what's new" showcase once for signed-in users, or any time the
  // admin trigger sends them here with ?whatsnew=1.
  useEffect(() => {
    const forced = new URLSearchParams(location.search).get('whatsnew') === '1';
    if (forced) {
      setShowWhatsNew(true);
      return;
    }
    if (!isGuest && userInfo && localStorage.getItem(WHATS_NEW_KEY) !== 'true') {
      setShowWhatsNew(true);
    }
  }, [isGuest, userInfo, location.search]);

  const closeWhatsNew = () => {
    localStorage.setItem(WHATS_NEW_KEY, 'true');
    setShowWhatsNew(false);
    if (location.search.includes('whatsnew')) {
      navigate('/dashboard', { replace: true });
    }
  };

  const handleLogin = async () => {
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

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
      actionLabel: isGuest ? 'Sign in to track' : watchedCount > 0 ? 'Manage tracked list' : 'Start tracking',
      badge: isGuest || watchedLoading ? undefined : `${watchedCount} active`,
      locked: isGuest,
      onClick: () => navigate('/tracked-classes')
    },
    {
      id: 'schedule',
      icon: 'calendar',
      title: 'Class schedule',
      description: 'View and manage your weekly class schedule with calendar export.',
      actionLabel: isGuest ? 'Sign in to plan' : 'View schedule',
      locked: isGuest,
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

      {showWhatsNew && <WhatsNewShowcase onClose={closeWhatsNew} />}
      
      {isGuest && (
        <div className="guest-banner" role="region" aria-label="Guest mode notice">
          <div className="guest-banner-copy">
            <Icon name="lock" size={20} aria-hidden />
            <div>
              <strong>You're browsing as a guest.</strong>
              <span> Search and grade history are open — log in to track classes and build a schedule.</span>
            </div>
          </div>
          <button type="button" className="guest-banner-btn" onClick={handleLogin}>
            Log in
          </button>
        </div>
      )}

      <section className="dashboard-header">
        <div className="header-copy">
          <span className="eyebrow">Overview</span>
          <h1 className="dashboard-title">
            {isGuest ? 'Welcome, Panther.' : `Welcome back, ${greetingName}.`}
          </h1>
          <p className="dashboard-subtitle">
            Keep an eye on enrollment and act quickly when seats open across Georgia State courses.
          </p>
        </div>

        {!isGuest && (
          <div className="tracked-summary" aria-live="polite">
            <div className="summary-icon">
              <Icon name="bookmark" size={26} aria-hidden />
            </div>
            <div className="summary-content">
              <span className="summary-label">Tracked classes</span>
              <span className="summary-value">{watchedLoading ? '…' : watchedCount}</span>
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-grid">
        {cards.map((card) => (
          <article key={card.id} className={`dashboard-card ${card.locked ? 'locked' : ''}`} data-card={card.id}>
            <div className="card-icon">
              <Icon name={card.locked ? 'lock' : card.icon} size={28} aria-hidden />
            </div>
            <h3 className="card-title">{card.title}</h3>
            <p className="card-description">{card.description}</p>

            <div className="card-footer">
              {card.badge && <span className="card-badge">{card.badge}</span>}
              <button
                type="button"
                className="card-button"
                onClick={card.onClick}
                disabled={card.locked}
                title={card.locked ? 'Sign in to use this feature' : undefined}
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
