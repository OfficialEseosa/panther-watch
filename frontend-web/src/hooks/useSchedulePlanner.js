import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWatchedClasses } from './useWatchedClasses.js';
import { useTerms } from './useTerms.js';
import { useSchedule } from './useSchedule.js';
import { buildApiUrl } from '../config';
import {
  WEEK_DAYS,
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

export function useSchedulePlanner() {
  const {
    watchedClassesWithDetails,
    loadWatchedClassesWithDetails,
    loading: watchedLoading
  } = useWatchedClasses();
  const { terms, termsLoading, getTermName } = useTerms();
  const {
    scheduleByTerm,
    scheduleLoading,
    addCourseToSchedule: addToSchedule,
    removeCourseFromSchedule,
    removeTermsFromSchedule,
    isCourseScheduled: isScheduled
  } = useSchedule();

  const [selectedTerm, setSelectedTerm] = useState(null);
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

  // Terms that have since flipped to "(View only)" can no longer be registered
  // for, so any schedule saved under them is stale, so clean it up (local + DB).
  useEffect(() => {
    if (termsLoading || terms.length === 0) return;
    const staleTerms = Object.keys(scheduleByTerm).filter((code) => {
      const term = terms.find((t) => t.code === code);
      return term && isViewOnlyTerm(term);
    });
    if (staleTerms.length > 0) {
      removeTermsFromSchedule(staleTerms);
    }
  }, [terms, termsLoading, scheduleByTerm, removeTermsFromSchedule]);

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

  // Mon-Fri always; weekend columns only when something actually meets then.
  const visibleDays = useMemo(() => {
    const used = new Set(scheduleBlocks.map((block) => block.day));
    return WEEK_DAYS.filter(
      (day, index) => index < 5 || used.has(day)
    );
  }, [scheduleBlocks]);

  const addCourseToSchedule = useCallback(
    (course) => {
      const termCode = course?.term || selectedTerm;
      const added = addToSchedule(course, selectedTerm);
      if (added && termCode) {
        setSelectedTerm((prevTerm) => (prevTerm === termCode ? prevTerm : termCode));
      }
      return added;
    },
    [selectedTerm, addToSchedule]
  );

  const isCourseScheduled = useCallback(
    (course) => isScheduled(course, selectedTerm),
    [isScheduled, selectedTerm]
  );

  const handleRemoveFromSchedule = useCallback(
    (crn) => {
      if (!selectedTerm) return;
      removeCourseFromSchedule(selectedTerm, crn);
    },
    [selectedTerm, removeCourseFromSchedule]
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
          txtLevel: searchForm.level,
          pageOffset: 0,
          pageMaxSize: 5
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

  const isLoading = termsLoading || watchedLoading || detailsLoading || scheduleLoading || !selectedTerm;
  const hasScheduleEntries = scheduleClasses.length > 0;
  const selectedTermLabel = selectedTerm ? getTermName(selectedTerm) : '';

  return {
    // data
    visibleDays,
    getTermName,
    selectedTerm,
    selectedTermLabel,
    availableTerms,
    hasScheduleEntries,
    scheduleBlocks,
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
