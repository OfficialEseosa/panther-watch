import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import './CourseResults.css';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import { useTerms } from '../../hooks/useTerms.js';
import LoadingBar from '../LoadingBar';
import CourseCard from './CourseCard';
import ExpandedCourseCard from '../ExpandedCourseCard';

function CourseResults({ courses, loading, error, selectedTerm, isTrackedView = false, onCourseRemoved, watchedCrns = [] }) {
  const [watchLoading, setWatchLoading] = useState({});
  const [expandedDetails, setExpandedDetails] = useState(null);
  const { getTermName: getTermNameFromContext } = useTerms();
  const { addWatchedClass, removeWatchedClass } = useWatchedClasses();

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
          Found {courses.length} course{courses.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="courses-grid">
        {courses.map((course) => {
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
              onWatchToggle={handleWatchToggle}
              onOpenDetails={setExpandedDetails}
              getTermName={getTermNameFromContext}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {expandedDetails && (
          <ExpandedCourseCard
            course={expandedDetails.course}
            grades={expandedDetails.grades}
            currentInstructors={[
              ...(instructorsByCourse[`${expandedDetails.course.subject} ${expandedDetails.course.courseNumber}`] || []),
            ]}
            isTrackedView={isTrackedView}
            isWatching={watchedCrns.includes(expandedDetails.course.courseReferenceNumber)}
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
