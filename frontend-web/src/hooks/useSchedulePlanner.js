import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useWatchedClasses } from './useWatchedClasses.js';
import { useTerms } from './useTerms.js';
import { useAuth } from './useAuth.js';
import { buildApiUrl } from '../config';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  addCourse,
  removeCourse
} from '../config/scheduleService.js';
import {
  DAYS,
  TIME_SLOTS,
  isViewOnlyTerm,
  parseTimeToMinutes,
  formatMinutesToLabel,
  getMeetingDays,
  getInstructorNames,
  generateICSFile,
  buildMeetingSummaries
} from '../pages/ScheduleBuilder/utils.js';

const downloadICSFile = (icsContent, termCode) => {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pantherwatch-schedule-${termCode}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export function useSchedulePlanner(locationSearch) {
  const {
    watchedClassesWithDetails,
    loadWatchedClassesWithDetails,
    loading: watchedLoading
  } = useWatchedClasses();
  const { terms, termsLoading, getTermName } = useTerms();
  const { isAuthenticated } = useAuth();

  const pendingCrnRef = useRef(null);

  const [selectedTerm, setSelectedTerm] = useState(null);
  const [scheduleByTerm, setScheduleByTerm] = useState(() => loadFromLocalStorage());
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('tracked');
  const [searchForm, setSearchForm] = useState({
    term: '',
    subject: '',
    courseNumber: '',
    level: 'US'
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Save to localStorage whenever schedule changes
  useEffect(() => {
    saveToLocalStorage(scheduleByTerm);
  }, [scheduleByTerm]);

  useEffect(() => {
    setSearchForm((prev) => {
      const nextTerm = selectedTerm || '';
      if (prev.term === nextTerm) {
        return prev;
      }
      return { ...prev, term: nextTerm };
    });
  }, [selectedTerm]);

  useEffect(() => {
    let isMounted = true;
    const fetchDetails = async () => {
      try {
        setDetailsLoading(true);
        await loadWatchedClassesWithDetails();
      } catch (error) {
        console.error('Failed to load tracked class details for schedule:', error);
      } finally {
        if (isMounted) {
          setDetailsLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [loadWatchedClassesWithDetails]);

  const availableTerms = useMemo(() => {
    const filtered = terms.filter((term) => !isViewOnlyTerm(term));
    const codes = new Set(filtered.map((term) => term.code));
    const scheduleTerms = Object.keys(scheduleByTerm)
      .filter((code) => !codes.has(code))
      .map((code) => ({
        code,
        description: getTermName(code)
      }));
    return [...scheduleTerms, ...filtered];
  }, [terms, scheduleByTerm, getTermName]);

  useEffect(() => {
    if (selectedTerm) {
      const exists = availableTerms.some((term) => term.code === selectedTerm);
      if (!exists && availableTerms.length > 0) {
        setSelectedTerm(availableTerms[0].code);
      }
      return;
    }

    if (availableTerms.length > 0) {
      setSelectedTerm(availableTerms[0].code);
    }
  }, [availableTerms, selectedTerm]);

  const scheduleClasses = useMemo(() => {
    if (!selectedTerm) return [];
    return scheduleByTerm[selectedTerm] || [];
  }, [scheduleByTerm, selectedTerm]);

  const scheduleBlocks = useMemo(() => {
    if (!scheduleClasses.length) return [];

    return scheduleClasses.flatMap((course) => {
      const meetings = course?.meetingsFaculty || [];
      const instructor = getInstructorNames(course);

      return meetings.flatMap((meeting, meetingIndex) => {
        const meetingTime = meeting?.meetingTime;
        if (!meetingTime) return [];

        const days = getMeetingDays(meetingTime);
        if (!days.length) return [];

        const startMinutes = parseTimeToMinutes(meetingTime.beginTime);
        const endMinutes = parseTimeToMinutes(meetingTime.endTime);
        if (startMinutes === null || endMinutes === null) return [];

        const locationParts = [];
        if (meetingTime.buildingDescription) {
          locationParts.push(meetingTime.buildingDescription);
        }
        if (meetingTime.room) {
          locationParts.push(`Room ${meetingTime.room}`);
        }

        const location = locationParts.join(' - ') || 'TBA';

        return days.map((day) => ({
          day,
          startMinutes,
          endMinutes,
          courseCode: `${course.subject} ${course.courseNumber}`,
          courseTitle: course.courseTitle,
          crn: course.courseReferenceNumber,
          instructor,
          location,
          meetingId: `${course.courseReferenceNumber}-${meetingIndex}-${day}`,
          course
        }));
      });
    });
  }, [scheduleClasses]);

  const getClassesForSlot = useCallback(
    (day, slotStart) => {
      const slotEnd = slotStart + 60;
      return scheduleBlocks.filter(
        (block) =>
          block.day === day &&
          block.startMinutes >= slotStart &&
          block.startMinutes < slotEnd
      );
    },
    [scheduleBlocks]
  );

  const addCourseToSchedule = useCallback(
    (course) => {
      if (!course) return false;
      const termCode = course.term || selectedTerm;
      if (!termCode) return false;

      let added = false;
      const normalizedCourse = { ...course, term: termCode };

      setScheduleByTerm((prev) => {
        const current = prev[termCode] || [];
        const exists = current.some(
          (item) => item.courseReferenceNumber === normalizedCourse.courseReferenceNumber
        );
        if (exists) {
          return prev;
        }
        added = true;
        return {
          ...prev,
          [termCode]: [...current, normalizedCourse]
        };
      });

      if (added) {
        setSelectedTerm((prevTerm) => (prevTerm === termCode ? prevTerm : termCode));
        
        // Sync with database in background if authenticated (optimistic update - UI already updated)
        if (isAuthenticated) {
          addCourse(termCode, normalizedCourse.courseReferenceNumber).catch(error => {
            console.error('Failed to sync add to database:', error);
          });
        }
      }

      return added;
    },
    [selectedTerm, isAuthenticated]
  );

  const isCourseScheduled = useCallback(
    (course) => {
      if (!course) return false;
      const termCode = course.term || selectedTerm;
      if (!termCode) return false;
      const current = scheduleByTerm[termCode] || [];
      return current.some(
        (item) => item.courseReferenceNumber === course.courseReferenceNumber
      );
    },
    [scheduleByTerm, selectedTerm]
  );

  const handleRemoveFromSchedule = useCallback(
    (crn) => {
      if (!selectedTerm) return;
      
      setScheduleByTerm((prev) => {
        const current = prev[selectedTerm] || [];
        const updated = current.filter(
          (course) => course.courseReferenceNumber !== crn
        );
        if (updated.length === current.length) {
          return prev;
        }
        const next = { ...prev };
        if (updated.length > 0) {
          next[selectedTerm] = updated;
        } else {
          delete next[selectedTerm];
        }
        
        // Sync with database in background if authenticated (optimistic update - UI already updated)
        if (isAuthenticated) {
          removeCourse(selectedTerm, crn).catch(error => {
            console.error('Failed to sync remove to database:', error);
          });
        }
        
        return next;
      });
    },
    [selectedTerm, isAuthenticated]
  );

  const handleAddToCalendar = useCallback(() => {
    if (!selectedTerm || scheduleClasses.length === 0) return;
    const icsContent = generateICSFile(scheduleClasses);
    downloadICSFile(icsContent, selectedTerm);
  }, [scheduleClasses, selectedTerm]);

  const resetSearchState = useCallback(() => {
    setSearchResults([]);
    setSearchError('');
    setSearchLoading(false);
  }, []);

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    resetSearchState();
  }, [resetSearchState]);

  const handleSearchInputChange = useCallback((event) => {
    const { name, value } = event.target;
    setSearchForm((prev) => ({
      ...prev,
      [name]: name === 'subject' ? value.toUpperCase() : value
    }));
    setSearchError('');
  }, []);

  const handleSearchSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!searchForm.term || !searchForm.subject || !searchForm.courseNumber) {
        setSearchError('Please fill in term, subject, and course number.');
        return;
      }

      setSearchLoading(true);
      setSearchError('');

      try {
        const params = new URLSearchParams({
          txtTerm: searchForm.term,
          txtSubject: searchForm.subject,
          txtCourseNumber: searchForm.courseNumber,
          txtLevel: searchForm.level
        });

        const response = await fetch(`${buildApiUrl('/courses/search')}?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!payload?.success) {
          throw new Error('Search response unsuccessful');
        }

        let results = Array.isArray(payload.data) ? payload.data : [];

        const normalized = results.map((course) => ({
          ...course,
          term: searchForm.term
        }));

        if (normalized.length === 0) {
          setSearchError('No courses found for that search.');
        }

        setSearchResults(normalized);
      } catch (error) {
        console.error('Course search failed:', error);
        setSearchResults([]);
        setSearchError('Search failed. Please try again.');
      } finally {
        setSearchLoading(false);
      }
    },
    [searchForm]
  );

  const trackedClassesForSelectedTerm = useMemo(() => {
    if (!selectedTerm || !Array.isArray(watchedClassesWithDetails)) return [];
    return watchedClassesWithDetails.filter(
      (course) => course.term === selectedTerm
    );
  }, [watchedClassesWithDetails, selectedTerm]);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch || '');
    const crnParam = params.get('add');
    if (crnParam) {
      pendingCrnRef.current = crnParam;
      setShowAddModal(true);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('add');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [locationSearch]);

  useEffect(() => {
    if (!pendingCrnRef.current) return;
    if (detailsLoading) return;

    const crn = pendingCrnRef.current;

    if (Array.isArray(watchedClassesWithDetails) && watchedClassesWithDetails.length > 0) {
      const match = watchedClassesWithDetails.find(
        (course) => course.courseReferenceNumber === crn
      );
      if (match) {
        const added = addCourseToSchedule(match);
        pendingCrnRef.current = null;
        if (added) {
          setShowAddModal(false);
        }
        return;
      }
    }

    setAddMode('search');
    resetSearchState();
    setSearchForm((prev) => ({ ...prev, crn }));
    pendingCrnRef.current = null;
  }, [
    watchedClassesWithDetails,
    detailsLoading,
    addCourseToSchedule,
    resetSearchState
  ]);

  const isLoading = termsLoading || watchedLoading || detailsLoading || !selectedTerm;
  const hasScheduleEntries = scheduleClasses.length > 0;
  const selectedTermLabel = selectedTerm ? getTermName(selectedTerm) : '';

  return {
    // data
    DAYS,
    TIME_SLOTS,
    getTermName,
    selectedTerm,
    selectedTermLabel,
    availableTerms,
    hasScheduleEntries,
    trackedClassesForSelectedTerm,
    searchForm,
    searchResults,
    searchLoading,
    searchError,
    detailsLoading,
    isLoading,
    formatMinutesToLabel,

    // actions
    setSelectedTerm,
    handleRemoveFromSchedule,
    handleAddToCalendar,
    addCourseToSchedule,
    isCourseScheduled,
    getClassesForSlot,
    setShowAddModal,
    showAddModal,
    closeAddModal,
    addMode,
    setAddMode,
    handleSearchInputChange,
    handleSearchSubmit,
    resetSearchState,
    buildMeetingSummaries
  };
}
