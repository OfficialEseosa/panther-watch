import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildApiUrl } from '../../config';
import './CourseResultsPage.css';
import CourseResults from '../../components/CourseResults';
import Icon from '../../components/Icon';
import { getTermName } from '../../utils';
import { useWatchedClasses } from '../../contexts/WatchedClassesContext';

function CourseResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useState(null);
  const { watchedClasses } = useWatchedClasses();

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

    try {
      const params = new URLSearchParams(searchData);
      const res = await fetch(`${buildApiUrl('/courses/search')}?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) {
        setError(`Search request failed (status ${res.status}). Please try again.`);
        setCourses([]);
        setLoading(false);
        return;
      }

      const json = await res.json();

      if (json.success) {
        setCourses(json.data || []);
      } else {
        setError('Search failed. Please try again.');
      }
    } catch (err) {
      console.error('An error occurred:', err);
      setError('An error occurred while searching. Please try again.');
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
