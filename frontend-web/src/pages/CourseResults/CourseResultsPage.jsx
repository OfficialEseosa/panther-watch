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
  const { watchedClasses } = useWatchedClasses();
  const { getTermName } = useTerms();

  const watchedCrns = watchedClasses.map((wc) => wc.crn);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchData = {
      txtLevel: params.get('txtLevel') || '',
      txtSubject: params.get('txtSubject') || '',
      txtTerm: params.get('txtTerm') || '',
      txtCourseNumber: params.get('txtCourseNumber') || ''
    };

    setSearchParams(searchData);

    if (!searchData.txtSubject || !searchData.txtTerm || !searchData.txtCourseNumber || !searchData.txtLevel) {
      navigate('/course-search');
      return;
    }

    performSearch(searchData);
  }, [location, navigate]);

  const performSearch = async (searchData) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams(searchData);
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
      setCourses(data);
    } catch (err) {
      console.error('Search failed:', err);
      setCourses([]);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewSearch = () => {
    navigate('/course-search');
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
    </div>
  );
}

export default CourseResultsPage;
