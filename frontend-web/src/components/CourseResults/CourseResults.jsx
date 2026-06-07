import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import './CourseResults.css';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import { useTerms } from '../../hooks/useTerms.js';
import { useAuth } from '../../hooks/useAuth.js';
import Icon from '../Icon';
import LoadingBar from '../LoadingBar';
import CourseCard from './CourseCard';
import ExpandedCourseCard from '../ExpandedCourseCard';

const PAGE_SIZE = 12;

function CourseResults({ courses, loading, error, selectedTerm, isTrackedView = false, onCourseRemoved, watchedCrns = [] }) {
  const [watchLoading, setWatchLoading] = useState({});
  const [expandedDetails, setExpandedDetails] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const { getTermName: getTermNameFromContext } = useTerms();
  const { addWatchedClass, removeWatchedClass } = useWatchedClasses();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const isGuest = !authLoading && !isAuthenticated;

  // Unified client-side filter: one box that matches either a CRN or a
  // professor name. Digits-only input is treated as a CRN; anything else is
  // matched against instructor display names. Mixed/partial input checks both.
  // Runs over the full result set, so it searches across every page.
  const visibleCourses = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return courses;
    const isNumeric = /^\d+$/.test(q);
    return courses.filter((c) => {
      const crn = String(c.courseReferenceNumber || '').toLowerCase();
      if (crn.includes(q)) return true;
      if (isNumeric) return false;
      return (c.faculty || []).some((f) => (f.displayName || '').toLowerCase().includes(q));
    });
  }, [courses, filterQuery]);

  const pageCount = Math.max(1, Math.ceil(visibleCourses.length / PAGE_SIZE));

  // Keep the page in range when the filter or result set changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [filterQuery, courses]);

  const safePage = Math.min(currentPage, pageCount);
  const pagedCourses = visibleCourses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goToPage = (page) => {
    const next = Math.min(Math.max(1, page), pageCount);
    setCurrentPage(next);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Distinct instructors per course among the current results, so the expanded
  // card's "By professor" view can show only professors teaching it now.
  const instructorsByCourse = useMemo(() => {
    const map = {};
    for (const c of courses) {
      const name = c.faculty?.[0]?.displayName;
      if (!name || name === 'TBA') continue;
      const key = `${c.subject} ${c.courseNumber}`;
      (map[key] ||= new Set()).add(name);
    }
    return map;
  }, [courses]);

  const handleWatchToggle = async (course) => {
    const crn = course.courseReferenceNumber;
    const courseTerm = course.term || selectedTerm;
    const key = `${crn}-${courseTerm}`;

    try {
      setWatchLoading((prev) => ({ ...prev, [key]: true }));

      const isCurrentlyWatching = watchedCrns.includes(crn);

      if (isCurrentlyWatching || isTrackedView) {
        await removeWatchedClass(crn, courseTerm);

        if (isTrackedView && onCourseRemoved) {
          onCourseRemoved(course);
        }
      } else {
        const watchData = {
          crn,
          term: courseTerm,
          courseTitle: course.courseTitle,
          courseNumber: course.courseNumber,
          subject: course.subject,
          instructor: course.faculty?.[0]?.displayName || 'TBA'
        };

        await addWatchedClass(watchData);
      }
    } catch (err) {
      console.error('Failed to toggle watch status:', err);
    } finally {
      setWatchLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (error) {
    return (
      <div className="error-message">
        {error}
      </div>
    );
  }

  if (loading) {
    return <LoadingBar message="Searching for courses..." />;
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <div className="results-section">
      <div className="results-header" aria-live="polite">
        <div className="results-count">
          {filterQuery.trim()
            ? `Showing ${visibleCourses.length} of ${courses.length} course${courses.length !== 1 ? 's' : ''}`
            : `Found ${courses.length} course${courses.length !== 1 ? 's' : ''}`}
        </div>
        <div className="results-filter">
          <Icon name="search" size={16} aria-hidden />
          <input
            type="text"
            className="results-filter-input"
            placeholder="Filter by professor or CRN"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            aria-label="Filter results by professor name or CRN"
          />
          {filterQuery && (
            <button
              type="button"
              className="results-filter-clear"
              onClick={() => setFilterQuery('')}
              aria-label="Clear filter"
            >
              <Icon name="x" size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {visibleCourses.length === 0 ? (
        <div className="results-empty">No courses match “{filterQuery}”.</div>
      ) : (
        <>
          <div className="courses-grid">
            {pagedCourses.map((course) => {
              const crn = course.courseReferenceNumber;
              const courseTerm = course.term || selectedTerm;
              const key = `${crn}-${courseTerm}`;

              return (
                <CourseCard
                  key={crn}
                  course={course}
                  isTrackedView={isTrackedView}
                  isWatching={watchedCrns.includes(crn)}
                  isWatchLoading={watchLoading[key]}
                  isGuest={isGuest}
                  onWatchToggle={handleWatchToggle}
                  onOpenDetails={setExpandedDetails}
                  getTermName={getTermNameFromContext}
                />
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage === 1}
              >
                <Icon name="chevronDown" size={16} style={{ transform: 'rotate(90deg)' }} />
                Previous
              </button>

              <span className="page-info">Page {safePage} of {pageCount}</span>

              <button
                type="button"
                className="pagination-btn"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage === pageCount}
              >
                Next
                <Icon name="chevronDown" size={16} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {expandedDetails && (
          <ExpandedCourseCard
            course={expandedDetails.course}
            grades={expandedDetails.grades}
            rating={expandedDetails.rating}
            currentInstructors={[
              ...(instructorsByCourse[`${expandedDetails.course.subject} ${expandedDetails.course.courseNumber}`] || []),
            ]}
            isTrackedView={isTrackedView}
            isWatching={watchedCrns.includes(expandedDetails.course.courseReferenceNumber)}
            isGuest={isGuest}
            onWatchToggle={handleWatchToggle}
            getTermName={getTermNameFromContext}
            onClose={() => setExpandedDetails(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default CourseResults;
