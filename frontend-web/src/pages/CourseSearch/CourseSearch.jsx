import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTerms } from '../../contexts/TermsContext'
import SubjectAutocomplete from '../../components/SubjectAutocomplete'
import './CourseSearch.css'

function CourseSearch() {
  const navigate = useNavigate()
  const [value, setValue] = useState({
    txtLevel: '',
    txtSubject: '',
    txtTerm: '',
    txtCourseNumber: ''
  })
  const [selectedSubjects, setSelectedSubjects] = useState([])
  const { terms, termsLoading, termsError } = useTerms()

  const handleChanges = (e) => {
    const { name, value: newValue } = e.target
    setValue({...value, [name]: newValue})

    if (name === 'txtTerm') {
      setSelectedSubjects([])
      setValue(prev => ({...prev, [name]: newValue, txtSubject: ''}))
    }
  }

  const handleSubjectsChange = (subjects) => {
    setSelectedSubjects(subjects)
    const subjectCodes = subjects.map(s => s.code).join(',')
    setValue(prev => ({...prev, txtSubject: subjectCodes}))
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Form submitted with values:', value);
    
    const params = new URLSearchParams(value);
    navigate(`/course-results?${params.toString()}`);
  }

  return (
    <div className="course-search-page">
      <div className="page-header">
        <h2 className="page-title">Search for Classes</h2>
        <p className="page-description">Find and explore available courses for the semester</p>
      </div>
      
      <div className="search-form-container">
        <form onSubmit={handleSubmit} className="course-search-form">
          <label htmlFor="txtLevel">Choose a degree: </label>
          <select id="txtLevel" name="txtLevel" onChange={(e) => handleChanges(e)} required>
            <option value="">-- Select a degree --</option>
            <option value="US">Bachelors (4 Year)</option>
          </select>

          <label htmlFor="txtSubject">Enter subjects:</label>
          <SubjectAutocomplete
            selectedTerm={value.txtTerm}
            selectedSubjects={selectedSubjects}
            onSubjectsChange={handleSubjectsChange}
            required={true}
          />

          <label htmlFor="txtTerm">Choose a term: </label>
          <select id="txtTerm" name="txtTerm" onChange={(e) => handleChanges(e)} required>
            <option value="">-- Select a term --</option>
            {termsLoading && <option disabled>Loading terms...</option>}
            {termsError && <option disabled>Error loading terms</option>}
            {!termsLoading && !termsError && terms.map(term => (
              <option key={term.code} value={term.code}>
                {term.description}
              </option>
            ))}
          </select>

          <label htmlFor="txtCourseNumber">Enter a course number:</label>
          <input id="txtCourseNumber" name="txtCourseNumber" type="text" placeholder="e.g. 2720" onChange={handleChanges} required />

          <button type="submit">Search Classes</button>
        </form>
      </div>
    </div>
  )
}

export default CourseSearch
