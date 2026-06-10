import { useState, useEffect } from 'react'
import { TermsContext } from './TermsContext.js'
import { buildApiUrl } from '../config'
import { isViewOnlyTerm } from '../utils/termUtils.js'

export const TermsProvider = ({ children }) => {
  const [terms, setTerms] = useState([])
  const [termsLoading, setTermsLoading] = useState(true)
  const [termsError, setTermsError] = useState(null)
  const [termMappings, setTermMappings] = useState({})

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        setTermsLoading(true)
        const response = await fetch(buildApiUrl('/courses/terms'), {
          credentials: 'include'
        })
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const termsData = await response.json()
        setTerms(termsData)
        
        // Build term mappings for quick lookup
        const mappings = {}
        termsData.forEach(term => {
          mappings[term.code] = term.description
        })
        setTermMappings(mappings)
        
        setTermsError(null)
      } catch (error) {
        console.error('Error fetching terms:', error)
        setTermsError('Failed to load terms')
        setTerms([])
        
        // Fallback mappings
        setTermMappings({
          '202508': 'Fall Semester 2025',
          '202501': 'Spring Semester 2025',
          '202505': 'Summer Semester 2025',
          '202408': 'Fall Semester 2024',
          '202401': 'Spring Semester 2024',
          '202405': 'Summer Semester 2024',
        })
      } finally {
        setTermsLoading(false)
      }
    }

    fetchTerms()
  }, [])

  const getTermName = (termCode) => {
    return termMappings[termCode] || termCode
  }

  // True when the term's registration window has closed ("(View only)" in
  // GoSolar). Unknown term codes are treated as open so a failed terms fetch
  // doesn't lock the user out of tracking.
  const isTermViewOnly = (termCode) => {
    const term = terms.find((t) => t.code === termCode)
    return term ? isViewOnlyTerm(term) : false
  }

  const value = {
    terms,
    termsLoading,
    termsError,
    termMappings,
    getTermName,
    isTermViewOnly
  }

  return (
    <TermsContext.Provider value={value}>
      {children}
    </TermsContext.Provider>
  )
}
