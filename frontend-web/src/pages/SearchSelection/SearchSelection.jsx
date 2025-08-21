import { useNavigate } from 'react-router-dom'
import './SearchSelection.css'

function SearchSelection() {
  const navigate = useNavigate()

  const handleCourseSearch = () => {
    navigate('/course-search')
  }

  const handleCrnSearch = () => {
    navigate('/crn-search')
  }

  return (
    <div className="search-selection">
      <div className="search-selection-container">
        <h1>Course Search</h1>
        <p>Choose how you'd like to search for courses:</p>
        
        <div className="search-options">
          <button 
            className="search-option-btn course-search-btn"
            onClick={handleCourseSearch}
          >
            <div className="btn-content">
              <h3>Search by Course Number</h3>
              <p>Search for courses using subject and course number</p>
            </div>
          </button>
          
          <button 
            className="search-option-btn crn-search-btn"
            onClick={handleCrnSearch}
          >
            <div className="btn-content">
              <h3>Search by CRN</h3>
              <p>Search for a specific course using its Course Reference Number</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

export default SearchSelection
