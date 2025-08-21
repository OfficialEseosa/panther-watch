import React, { createContext, useContext, useState, useEffect } from 'react'
import { buildApiUrl } from '../config'

const TermsContext = createContext()

export const useTerms = () => {
  const context = useContext(TermsContext)
  if (!context) {
    throw new Error('useTerms must be used within a TermsProvider')
  }
  return context
}

export const TermsProvider = ({ children }) => {
  const [terms, setTerms] = useState([])
  const [termsLoading, setTermsLoading] = useState(true)
  const [termsError, setTermsError] = useState(null)
  const [termMappings, setTermMappings] = useState({})

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        setTermsLoading(true)
        const response = await fetch(buildApiUrl('/courses/terms'))
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

  const value = {
    terms,
    termsLoading,
    termsError,
    termMappings,
    getTermName
  }

  return (
    <TermsContext.Provider value={value}>
      {children}
    </TermsContext.Provider>
  )
}
