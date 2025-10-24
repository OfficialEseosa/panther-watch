import { createContext } from 'react';

export const TutorialContext = createContext({
  showTutorial: false,
  setShowTutorial: () => {},
  hasSeenTutorial: false,
  markTutorialAsSeen: () => {},
});
