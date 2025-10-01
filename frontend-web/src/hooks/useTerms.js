import { useContext } from 'react'
import { TermsContext } from '../contexts/TermsContext.js'

export function useTerms() {
  const context = useContext(TermsContext)
  if (!context) {
    throw new Error('useTerms must be used within a TermsProvider')
  }
  return context
}

export default useTerms
