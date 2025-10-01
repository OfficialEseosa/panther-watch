import { useContext } from 'react'
import { WatchedClassesContext } from '../contexts/WatchedClassesContext.js'

export function useWatchedClasses() {
  const context = useContext(WatchedClassesContext)
  if (context === undefined) {
    throw new Error('useWatchedClasses must be used within a WatchedClassesProvider')
  }
  return context
}

export default useWatchedClasses
