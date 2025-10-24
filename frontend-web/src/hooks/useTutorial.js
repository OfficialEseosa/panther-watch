import { useContext } from 'react';
import { TutorialContext } from '../contexts/TutorialContext.js';

export function useTutorial() {
  const context = useContext(TutorialContext);
  
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  
  return context;
}
