import { useState, useEffect, useRef } from 'react'
import { buildApiUrl } from '../../config/apiConfig'
import { decodeHtmlEntities } from '../../utils'
import './SubjectAutocomplete.css'

function SubjectAutocomplete({ 
  selectedTerm, 
  selectedSubjects, 
  onSubjectsChange,
  // Single select mode props (new)
  value,
  onChange,
  placeholder,
  isSingleSelect = false,
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
  const highlightedItemRef = useRef(null)

  // Use single select mode if isSingleSelect is true
  const currentSelectedSubjects = isSingleSelect ? [] : (selectedSubjects || [])

  // Debounced subject search
  const searchSubjects = async (searchTerm, term) => {
    if (!searchTerm.trim()) return
    
    // For single select, use current value if no term provided
    const termToUse = term || selectedTerm
    if (!termToUse) return
    
    setLoadingSubjects(true)
    try {
      const response = await fetch(buildApiUrl(`/courses/subjects?searchTerm=${encodeURIComponent(searchTerm)}&term=${encodeURIComponent(termToUse)}&offset=1&max=10`), {
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
    
    // In single select mode, if clearing the input, also clear the value
    if (isSingleSelect && inputValue === '') {
      onChange('')
    }
    
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
    if (isSingleSelect) {
      // Single select mode: just set the value through onChange
      onChange(subject.code)
      setSubjectSearch('') // Clear search after selection
      setShowSuggestions(false)
      setSubjectSuggestions([])
      setHighlightedIndex(-1)
    } else {
      // Multi select mode: add to array
      if (!currentSelectedSubjects.find(s => s.code === subject.code)) {
        const newSelectedSubjects = [...currentSelectedSubjects, subject]
        onSubjectsChange(newSelectedSubjects)
      }
      setSubjectSearch('')
      setShowSuggestions(false)
      setSubjectSuggestions([])
      setHighlightedIndex(-1)
    }
  }

  // Remove selected subject (multi-select only)
  const removeSubject = (subjectCode) => {
    const newSelectedSubjects = currentSelectedSubjects.filter(s => s.code !== subjectCode)
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

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedItemRef.current) {
      highlightedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [highlightedIndex])

  // Automatically highlight first item when suggestions appear
  useEffect(() => {
    if (showSuggestions && subjectSuggestions.length > 0) {
      setHighlightedIndex(0)
    }
  }, [showSuggestions, subjectSuggestions.length])

  return (
    <div className="subject-autocomplete-container">
      {isSingleSelect ? (
        /* Single select mode - simpler UI */
        <div className="subject-single-select">
          <div className="subject-input-container">
            <input 
              ref={subjectInputRef}
              type="text" 
              value={subjectSearch || (value && !subjectSearch ? value : '')}
              placeholder={!selectedTerm ? "Select a term first" : placeholder || "Search for subject"}
              onChange={handleSubjectInputChange}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              onKeyDown={(e) => {
                if (!showSuggestions || subjectSuggestions.length === 0) {
                  // Allow clearing with Backspace or Delete even when suggestions are not shown
                  if ((e.key === 'Backspace' || e.key === 'Delete') && value && !subjectSearch) {
                    e.preventDefault()
                    onChange('')
                  }
                  return
                }

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
              required={required}
            />
            {loadingSubjects && <div className="loading-spinner"></div>}
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && subjectSuggestions.length > 0 && (
            <div ref={suggestionsRef} className="suggestions-dropdown">
              {subjectSuggestions.map((subject, index) => (
                <button
                  key={subject.code}
                  ref={index === highlightedIndex ? highlightedItemRef : null}
                  type="button"
                  className={`suggestion-item ${index === highlightedIndex ? 'highlighted' : ''}`}
                  onClick={() => handleSubjectSelect(subject)}
                >
                  <span className="subject-code">{subject.code}</span>
                  <span className="subject-description">{decodeHtmlEntities(subject.description)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Multi-select mode - original UI */
        <>
          {/* Subject input wrapper with tags inside */}
          <div 
            className={`subject-input-wrapper ${disabled || !selectedTerm ? 'disabled' : ''}`}
            onClick={() => subjectInputRef.current?.focus()}
          >
            {/* Selected subjects display inside input */}
            {currentSelectedSubjects.length > 0 && (
              <div className="selected-subjects">
                {currentSelectedSubjects.map(subject => (
                  <span key={subject.code} className="subject-tag">
                    {subject.description}
                    <button 
                      type="button" 
                      className="remove-subject" 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSubject(subject.code);
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
                    : currentSelectedSubjects.length > 0 
                      ? "Add another..." 
                      : "e.g. Computer Science"
                }
                onChange={handleSubjectInputChange}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
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
                required={required && currentSelectedSubjects.length === 0}
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
                  ref={index === highlightedIndex ? highlightedItemRef : null}
                  type="button"
                  className={`suggestion-item ${currentSelectedSubjects.find(s => s.code === subject.code) ? 'already-selected' : ''} ${index === highlightedIndex ? 'highlighted' : ''}`}
                  onClick={() => handleSubjectSelect(subject)}
                  disabled={currentSelectedSubjects.find(s => s.code === subject.code)}
                >
                  <span className="subject-code">{subject.code}</span>
                  <span className="subject-description">{decodeHtmlEntities(subject.description)}</span>
                </button>
              ))}
            </div>
          )}
          
          {!selectedTerm && (
            <small className="helper-text">Please select a term first to enable subject search</small>
          )}
        </>
      )}
    </div>
  )
}

export default SubjectAutocomplete
