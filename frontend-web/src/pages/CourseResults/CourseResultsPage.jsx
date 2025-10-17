import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildApiUrl } from '../../config';
import './CourseResultsPage.css';
import CourseResults from '../../components/CourseResults';
import Icon from '../../components/Icon';
import { useTerms } from '../../hooks/useTerms.js';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';

function CourseResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMorePages, setHasMorePages] = useState(false);
  const { watchedClasses } = useWatchedClasses();
  const { getTermName } = useTerms();

  const resultsPerPage = 10;

  const watchedCrns = watchedClasses.map((wc) => wc.crn);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchData = {
      txtLevel: params.get('txtLevel') || '',
      txtSubject: params.get('txtSubject') || '',
      txtTerm: params.get('txtTerm') || '',
      txtCourseNumber: params.get('txtCourseNumber') || ''
    };
    
    const page = parseInt(params.get('page')) || 1;
    setCurrentPage(page);
    setSearchParams(searchData);

    if (!searchData.txtSubject || !searchData.txtTerm || !searchData.txtCourseNumber || !searchData.txtLevel) {
      navigate('/course-search');
      return;
    }

    performSearch(searchData, page);
  }, [location, navigate]);

  const performSearch = async (searchData, page = 1) => {
    setLoading(true);
    setError(null);

    const offset = (page - 1) * resultsPerPage;

    const searchWithPagination = {
      ...searchData,
      pageOffset: offset,
      pageMaxSize: resultsPerPage + 1
    };

    const params = new URLSearchParams(searchWithPagination);
    const url = `${buildApiUrl('/courses/search')}?${params.toString()}`;

    const attemptFetch = async (attempt) => {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'include'
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (json.success) {
          return json.data || [];
        }
        throw new Error('Response marked unsuccessful');
      } catch (err) {
        if (attempt < 2) {
          const backoff = 300 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, backoff));
          return attemptFetch(attempt + 1);
        }
        throw err;
      }
    };

    try {
      const data = await attemptFetch(0);

      const hasMore = data.length > resultsPerPage;
      const actualResults = hasMore ? data.slice(0, resultsPerPage) : data;
      
      setCourses(actualResults);
      setHasMorePages(hasMore);
      
    } catch (err) {
      console.error('Search failed:', err);
      setCourses([]);
      setHasMorePages(false);
      setError('Failed to load courses. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewSearch = () => {
    navigate('/course-search');
  };

  const goToPage = (page) => {
    if (page < 1) return;
    
    const params = new URLSearchParams(location.search);
    params.set('page', page.toString());
    navigate(`${location.pathname}?${params.toString()}`);
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (hasMorePages) {
      goToPage(currentPage + 1);
    }
  };

  return (
    <div className="course-results-page">
      <div className="course-results-toolbar">
        <button type="button" onClick={handleNewSearch} className="new-search-button">
          <Icon name="search" size={18} aria-hidden />
          New search
        </button>
        {searchParams && (
          <div className="search-summary">
            <span className="summary-label">Search</span>
            <span className="summary-value">
              {searchParams.txtSubject} {searchParams.txtCourseNumber} - {getTermName(searchParams.txtTerm)}
            </span>
          </div>
        )}
      </div>

      <CourseResults
        courses={courses}
        loading={loading}
        error={error}
        selectedTerm={searchParams?.txtTerm}
        watchedCrns={watchedCrns}
      />

      {/* Pagination Controls */}
      {!loading && !error && courses.length > 0 && (
        <div className="pagination-controls">
          <button 
            type="button" 
            className="pagination-btn" 
            onClick={goToPreviousPage}
            disabled={currentPage === 1}
          >
            <Icon name="chevronDown" size={16} style={{ transform: 'rotate(90deg)' }} />
            Previous
          </button>
          
          <span className="page-info">
            Page {currentPage}
            {courses.length === resultsPerPage && ` • ${courses.length} results`}
          </span>
          
          <button 
            type="button" 
            className="pagination-btn" 
            onClick={goToNextPage}
            disabled={!hasMorePages}
          >
            Next
            <Icon name="chevronDown" size={16} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
      )}
    </div>
  );
}

export default CourseResultsPage;
