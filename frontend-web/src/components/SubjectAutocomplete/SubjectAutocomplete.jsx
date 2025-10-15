import { useState, useEffect, useRef } from 'react'
import { buildApiUrl } from '../../config/apiConfig'
import './SubjectAutocomplete.css'

function SubjectAutocomplete({ 
  selectedTerm, 
  selectedSubjects, 
  onSubjectsChange, 
  disabled = false,
  required = false 
}) {
  const [subjectSearch, setSubjectSearch] = useState('')
  const [subjectSuggestions, setSubjectSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const subjectInputRef = useRef(null)
  const suggestionsRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  // Debounced subject search
  const searchSubjects = async (searchTerm, term) => {
    if (!searchTerm.trim() || !term) return
    
    setLoadingSubjects(true)
    try {
      const response = await fetch(buildApiUrl(`/courses/subjects?searchTerm=${encodeURIComponent(searchTerm)}&term=${encodeURIComponent(term)}&offset=1&max=10`), {
        credentials: 'include'
      })
      if (response.ok) {
        const subjects = await response.json()
        setSubjectSuggestions(subjects)
        setShowSuggestions(true)
      }
    } catch (error) {
      console.error('Error fetching subjects:', error)
      setSubjectSuggestions([])
    } finally {
      setLoadingSubjects(false)
    }
  }

  // Handle subject input changes with debouncing
  const handleSubjectInputChange = (e) => {
    const inputValue = e.target.value
    setSubjectSearch(inputValue)
    setHighlightedIndex(-1) // Reset highlighting
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    // Set new timeout for debounced search
    if (inputValue.trim() && selectedTerm) {
      searchTimeoutRef.current = setTimeout(() => {
        searchSubjects(inputValue, selectedTerm)
      }, 300) // 300ms delay
    } else {
      setSubjectSuggestions([])
      setShowSuggestions(false)
    }
  }

  // Handle selecting a subject from suggestions
  const handleSubjectSelect = (subject) => {
    // Check if already selected
    if (!selectedSubjects.find(s => s.code === subject.code)) {
      const newSelectedSubjects = [...selectedSubjects, subject]
      onSubjectsChange(newSelectedSubjects)
    }
    setSubjectSearch('')
    setShowSuggestions(false)
    setSubjectSuggestions([])
    setHighlightedIndex(-1)
  }

  // Remove selected subject
  const removeSubject = (subjectCode) => {
    const newSelectedSubjects = selectedSubjects.filter(s => s.code !== subjectCode)
    onSubjectsChange(newSelectedSubjects)
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target) &&
          subjectInputRef.current && !subjectInputRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Clear timeout on component unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // Reset search when term changes
  useEffect(() => {
    setSubjectSearch('')
    setSubjectSuggestions([])
    setShowSuggestions(false)
    setHighlightedIndex(-1)
  }, [selectedTerm])

  return (
    <div className="subject-autocomplete-container">
      {/* Subject input wrapper with tags inside */}
      <div 
        className={`subject-input-wrapper ${disabled || !selectedTerm ? 'disabled' : ''}`}
        onClick={() => subjectInputRef.current?.focus()}
      >
        {/* Selected subjects display inside input */}
        {selectedSubjects.length > 0 && (
          <div className="selected-subjects">
            {selectedSubjects.map(subject => (
              <span key={subject.code} className="subject-tag">
                {subject.description}
                <button 
                  type="button" 
                  className="remove-subject" 
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSubject(subject.code)
                  }}
                  aria-label={`Remove ${subject.description}`}
                  disabled={disabled}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        
        {/* Subject search input */}
        <div className="subject-input-container">
          <input 
            ref={subjectInputRef}
            id="txtSubject" 
            type="text" 
            value={subjectSearch}
            placeholder={
              !selectedTerm 
                ? "Select a term first" 
                : selectedSubjects.length > 0 
                  ? "Add another..." 
                  : "e.g. Computer Science"
            }
            onChange={handleSubjectInputChange}
            onKeyDown={(e) => {
            if (!showSuggestions || subjectSuggestions.length === 0) return

            switch (e.key) {
              case 'ArrowDown':
                e.preventDefault()
                setHighlightedIndex(prev => 
                  prev < subjectSuggestions.length - 1 ? prev + 1 : 0
                )
                break
              case 'ArrowUp':
                e.preventDefault()
                setHighlightedIndex(prev => 
                  prev > 0 ? prev - 1 : subjectSuggestions.length - 1
                )
                break
              case 'Enter':
                e.preventDefault()
                if (highlightedIndex >= 0 && highlightedIndex < subjectSuggestions.length) {
                  handleSubjectSelect(subjectSuggestions[highlightedIndex])
                }
                break
              case 'Escape':
                setShowSuggestions(false)
                setHighlightedIndex(-1)
                break
            }
          }}
          onFocus={() => {
            if (subjectSuggestions.length > 0) {
              setShowSuggestions(true)
            }
          }}
            disabled={disabled || !selectedTerm}
            required={required && selectedSubjects.length === 0}
          />
        </div>
        
        {/* Loading spinner */}
        {loadingSubjects && <div className="loading-spinner"></div>}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && subjectSuggestions.length > 0 && (
        <div ref={suggestionsRef} className="suggestions-dropdown">
          {subjectSuggestions.map((subject, index) => (
            <button
              key={subject.code}
              type="button"
              className={`suggestion-item ${selectedSubjects.find(s => s.code === subject.code) ? 'already-selected' : ''} ${index === highlightedIndex ? 'highlighted' : ''}`}
              onClick={() => handleSubjectSelect(subject)}
              disabled={selectedSubjects.find(s => s.code === subject.code)}
            >
              <span className="subject-code">{subject.code}</span>
              <span className="subject-description">{subject.description}</span>
            </button>
          ))}
        </div>
      )}
      
      {!selectedTerm && (
        <small className="helper-text">Please select a term first to enable subject search</small>
      )}
    </div>
  )
}

export default SubjectAutocomplete
