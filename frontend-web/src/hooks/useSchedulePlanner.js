import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useWatchedClasses } from './useWatchedClasses.js';
import { useTerms } from './useTerms.js';
import { useAuth } from './useAuth.js';
import { buildApiUrl } from '../config';
import { authService } from '../config/authService.js';
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
  const [scheduleByTerm, setScheduleByTerm] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
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

  // Fetch full schedule from backend with course details
  const loadScheduleFromBackend = useCallback(async () => {
    if (!isAuthenticated) {
      setScheduleByTerm({});
      setScheduleLoading(false);
      return;
    }

    setScheduleLoading(true);
    try {
      // Get CRNs grouped by term from backend
      const token = await authService.getAccessToken();
      const response = await fetch(buildApiUrl('/schedule'), {
        method: 'GET',
        credentials: 'include',
        headers: { 
          'Accept': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load schedule: ${response.status}`);
      }

      const scheduleData = await response.json();
      
      // scheduleData is { "202601": [{id, termCode, crn, addedAt}, ...], ... }
      // We need to fetch full course details for each CRN
      const scheduleWithDetails = {};

      for (const [termCode, entries] of Object.entries(scheduleData)) {
        if (!entries || entries.length === 0) continue;

        // Group CRNs by subject/courseNumber to minimize API calls
        const courseGroups = new Map();
        
        for (const entry of entries) {
          // We'll need to fetch each course individually since we only have CRNs
          // Store CRN for now, we'll fetch details next
          if (!scheduleWithDetails[termCode]) {
            scheduleWithDetails[termCode] = [];
          }
          scheduleWithDetails[termCode].push({ crn: entry.crn, termCode });
        }
      }

      // Now fetch course details for all CRNs
      for (const [termCode, entries] of Object.entries(scheduleWithDetails)) {
        const detailedCourses = [];

        for (const entry of entries) {
          try {
            // Search for this specific CRN
            const params = new URLSearchParams({
              txtTerm: termCode,
              txtCRN: entry.crn,
              pageMaxSize: 1
            });

            const courseResponse = await fetch(
              `${buildApiUrl('/courses/search')}?${params.toString()}`,
              {
                method: 'GET',
                headers: { Accept: 'application/json' },
                credentials: 'include'
              }
            );

            if (courseResponse.ok) {
              const payload = await courseResponse.json();
              if (payload?.success && payload?.data && payload.data.length > 0) {
                const course = { ...payload.data[0], term: termCode };
                detailedCourses.push(course);
              }
            }
          } catch (error) {
            console.error(`Failed to fetch details for CRN ${entry.crn}:`, error);
          }
        }

        scheduleWithDetails[termCode] = detailedCourses;
      }

      setScheduleByTerm(scheduleWithDetails);
    } catch (error) {
      console.error('Failed to load schedule from backend:', error);
      setScheduleByTerm({});
    } finally {
      setScheduleLoading(false);
    }
  }, [isAuthenticated]);

  // Load schedule on mount and when authentication changes
  useEffect(() => {
    loadScheduleFromBackend();
  }, [loadScheduleFromBackend]);

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
    async (course) => {
      if (!course) return false;
      if (!isAuthenticated) {
        console.warn('Cannot add course to schedule: User not authenticated');
        return false;
      }
      
      const termCode = course.term || selectedTerm;
      if (!termCode) return false;

      // Check if already exists
      const current = scheduleByTerm[termCode] || [];
      const exists = current.some(
        (item) => item.courseReferenceNumber === course.courseReferenceNumber
      );
      if (exists) return false;

      try {
        // Add to backend
        const token = await authService.getAccessToken();
        const response = await fetch(buildApiUrl('/schedule'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({ termCode, crn: course.courseReferenceNumber })
        });

        if (!response.ok) {
          throw new Error(`Failed to add course: ${response.status}`);
        }

        // Update local state
        const normalizedCourse = { ...course, term: termCode };
        setScheduleByTerm((prev) => ({
          ...prev,
          [termCode]: [...(prev[termCode] || []), normalizedCourse]
        }));

        setSelectedTerm((prevTerm) => (prevTerm === termCode ? prevTerm : termCode));
        return true;
      } catch (error) {
        console.error('Failed to add course to schedule:', error);
        return false;
      }
    },
    [selectedTerm, scheduleByTerm, isAuthenticated]
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
    async (crn) => {
      if (!selectedTerm || !isAuthenticated) {
        console.warn('Cannot remove course: User not authenticated');
        return;
      }
      
      try {
        // Remove from backend
        const token = await authService.getAccessToken();
        const response = await fetch(buildApiUrl(`/schedule/${selectedTerm}/${crn}`), {
          method: 'DELETE',
          credentials: 'include',
          headers: { 
            'Accept': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to remove course: ${response.status}`);
        }

        // Update local state
        setScheduleByTerm((prev) => {
          const current = prev[selectedTerm] || [];
          const updated = current.filter(
            (course) => course.courseReferenceNumber !== crn
          );
          
          const next = { ...prev };
          if (updated.length > 0) {
            next[selectedTerm] = updated;
          } else {
            delete next[selectedTerm];
          }
          
          return next;
        });
      } catch (error) {
        console.error('Failed to remove course from schedule:', error);
      }
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

  const isLoading = termsLoading || watchedLoading || detailsLoading || scheduleLoading || !selectedTerm;
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
    scheduleLoading,

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
