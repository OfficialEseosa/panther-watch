import { useState, useEffect } from 'react';
import { TutorialContext } from './TutorialContext.js';

const TUTORIAL_STORAGE_KEY = 'pantherwatch_tutorial_seen';

export function TutorialProvider({ children }) {
  const [showTutorial, setShowTutorial] = useState(false);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(true);

  useEffect(() => {
    // Check if user has seen the tutorial before
    const tutorialSeen = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    
    if (tutorialSeen === 'true') {
      setHasSeenTutorial(true);
      setShowTutorial(false);
    } else {
      setHasSeenTutorial(false);
      // Don't automatically show here - let the Dashboard component decide when
    }
  }, []);

  const markTutorialAsSeen = () => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    setHasSeenTutorial(true);
    setShowTutorial(false);
  };

  const value = {
    showTutorial,
    setShowTutorial,
    hasSeenTutorial,
    markTutorialAsSeen,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}
