import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../Icon';
import ExpandedCourseCard from '../ExpandedCourseCard';
import { decodeHtmlEntities } from '../../utils';
import { useCourseGrades } from '../../hooks/useCourseGrades.js';
import { useProfessorRatings } from '../../hooks/useProfessorRatings.js';
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js';
import { useTerms } from '../../hooks/useTerms.js';
import { useSchedule } from '../../hooks/useSchedule.js';
import { colorForCrn } from '../../utils/scheduleColors.js';
import { DAY_ABBREVIATIONS } from '../../pages/ScheduleBuilder/utils.js';

const MotionDiv = motion.div;
const MotionButton = motion.button;

const HOUR_HEIGHT = 64; // px per hour on the week grid
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

// Match the card->modal morph used by the search results grid.
const MORPH = { type: 'spring', stiffness: 320, damping: 34 };

/**
 * Assign overlapping blocks within one day to side-by-side columns so nothing
 * is hidden. Returns blocks decorated with { column, columnCount }.
 */
function layoutDayBlocks(blocks) {
  const sorted = [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
  );

  // Build clusters of transitively-overlapping blocks; columns are assigned
  // within each cluster so non-overlapping classes keep full width.
  const clusters = [];
  let current = null;
  let clusterEnd = -1;

  sorted.forEach((block) => {
    if (!current || block.startMinutes >= clusterEnd) {
      current = [];
      clusters.push(current);
      clusterEnd = block.endMinutes;
    } else {
      clusterEnd = Math.max(clusterEnd, block.endMinutes);
    }
    current.push(block);
  });

  const positioned = [];
  clusters.forEach((cluster) => {
    const columnEnds = [];
    const placed = cluster.map((block) => {
      let column = columnEnds.findIndex((end) => block.startMinutes >= end);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(block.endMinutes);
      } else {
        columnEnds[column] = block.endMinutes;
      }
      return { ...block, column };
    });
    placed.forEach((block) => {
      positioned.push({ ...block, columnCount: columnEnds.length });
    });
  });

  return positioned;
}

/**
 * Full course details for a class clicked on the calendar. Loads grade history
 * and RMP ratings on demand and wires watch/schedule toggles, so the calendar
 * opens the exact same ExpandedCourseCard the search results use.
 */
function ScheduleClassDetails({ course: clickedCourse, layoutId, onClose }) {
  const {
    scheduleByTerm,
    isCourseScheduled,
    addCourseToSchedule,
    removeCourseFromSchedule,
    setCourseColor
  } = useSchedule();

  // Prefer the live copy from the schedule so color changes reflect instantly;
  // fall back to the clicked snapshot if the class was just removed.
  const course =
    (scheduleByTerm[clickedCourse.term] || []).find(
      (c) => c.courseReferenceNumber === clickedCourse.courseReferenceNumber
    ) || clickedCourse;

  const instructor = course.faculty?.[0]?.displayName || null;
  const { grades } = useCourseGrades({
    subject: course.subject,
    courseNumber: course.courseNumber,
    instructor: instructor !== 'TBA' ? instructor : null
  });
  const { rating } = useProfessorRatings({
    instructor: instructor !== 'TBA' ? instructor : null
  });
  const { isWatchingClass, addWatchedClass, removeWatchedClass } = useWatchedClasses();
  const { getTermName, isTermViewOnly } = useTerms();

  const crn = course.courseReferenceNumber;
  const term = course.term;
  const isWatching = isWatchingClass(crn, term);
  const isScheduled = isCourseScheduled(course, term);

  const handleScheduleToggle = () => {
    if (isScheduled) {
      removeCourseFromSchedule(term, crn);
    } else {
      addCourseToSchedule(course, term);
    }
  };

  const handleWatchToggle = async () => {
    try {
      if (isWatching) {
        await removeWatchedClass(crn, term);
      } else {
        await addWatchedClass({
          crn,
          term,
          courseTitle: course.courseTitle,
          courseNumber: course.courseNumber,
          subject: course.subject,
          instructor: instructor || 'TBA'
        });
      }
    } catch (err) {
      console.error('Failed to toggle watch status from schedule:', err);
    }
  };

  return (
    <ExpandedCourseCard
      course={course}
      grades={grades}
      rating={rating}
      currentInstructors={instructor ? [instructor] : []}
      selectedTerm={term}
      isWatching={isWatching}
      isScheduled={isScheduled}
      isViewOnly={isTermViewOnly(term)}
      onWatchToggle={handleWatchToggle}
      onScheduleToggle={handleScheduleToggle}
      getTermName={getTermName}
      onClose={onClose}
      layoutId={layoutId}
      scheduleColor={course.scheduleColor || colorForCrn(crn)}
      onScheduleColorChange={isScheduled ? (color) => setCourseColor(term, crn, color) : undefined}
    />
  );
}

function ScheduleCalendar({ days, blocks, formatMinutesToLabel }) {
  // { course, layoutId } of the clicked class; layoutId points at the exact
  // element that was clicked so the hero morph starts from it.
  const [selected, setSelected] = useState(null);

  // The visible time window hugs the actual schedule but never collapses
  // below the standard class day.
  const { startHour, endHour } = useMemo(() => {
    if (!blocks.length) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }
    const minStart = Math.min(...blocks.map((b) => b.startMinutes));
    const maxEnd = Math.max(...blocks.map((b) => b.endMinutes));
    return {
      startHour: Math.min(DEFAULT_START_HOUR, Math.floor(minStart / 60)),
      endHour: Math.max(DEFAULT_END_HOUR, Math.ceil(maxEnd / 60))
    };
  }, [blocks]);

  const hours = useMemo(() => {
    const list = [];
    for (let hour = startHour; hour < endHour; hour += 1) {
      list.push(hour);
    }
    return list;
  }, [startHour, endHour]);

  const totalMinutes = (endHour - startHour) * 60;
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT;

  const blocksByDay = useMemo(() => {
    const map = {};
    days.forEach((day) => {
      map[day] = layoutDayBlocks(blocks.filter((block) => block.day === day));
    });
    return map;
  }, [blocks, days]);

  const blockPosition = (block) => {
    const top = ((block.startMinutes - startHour * 60) / totalMinutes) * 100;
    const height =
      ((block.endMinutes - block.startMinutes) / totalMinutes) * 100;
    const width = 100 / block.columnCount;
    return {
      top: `${top}%`,
      height: `${Math.max(height, 2)}%`,
      left: `${block.column * width}%`,
      width: `calc(${width}% - 3px)`
    };
  };

  const openDetails = (classBlock, layoutId) => {
    setSelected({ course: classBlock.course, layoutId });
  };

  return (
    <>
      {/* Week grid, hidden on small screens in favor of the agenda below. */}
      <div className="calendar-week" role="grid" aria-label="Weekly schedule">
        <div
          className="calendar-week-inner"
          style={{ '--day-count': days.length }}
        >
          <div className="calendar-head-row">
            <div className="calendar-corner" />
            {days.map((day) => (
              <div key={day} className="calendar-day-head">
                <span className="calendar-day-full">{day}</span>
                <span className="calendar-day-abbr">{DAY_ABBREVIATIONS[day] || day}</span>
              </div>
            ))}
          </div>

          <div className="calendar-body" style={{ height: `${bodyHeight}px` }}>
            <div className="calendar-hours">
              {hours.map((hour) => (
                <div key={hour} className="calendar-hour-label" style={{ height: `${HOUR_HEIGHT}px` }}>
                  {formatMinutesToLabel(hour * 60)}
                </div>
              ))}
            </div>

            {days.map((day) => (
              <div key={day} className="calendar-day-col">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="calendar-hour-line"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  />
                ))}
                {blocksByDay[day].map((classBlock) => {
                  const layoutId = `sched-${classBlock.meetingId}`;
                  const color =
                    classBlock.course.scheduleColor || colorForCrn(classBlock.crn);
                  return (
                    <MotionDiv
                      key={classBlock.meetingId}
                      layoutId={layoutId}
                      transition={MORPH}
                      className="class-block"
                      style={{ ...blockPosition(classBlock), backgroundColor: color }}
                      onClick={() => openDetails(classBlock, layoutId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetails(classBlock, layoutId);
                        }
                      }}
                      title={`${classBlock.courseCode} · ${classBlock.location}`}
                    >
                      <div className="class-code">{classBlock.courseCode}</div>
                      <div className="class-time">
                        {formatMinutesToLabel(classBlock.startMinutes)} -{' '}
                        {formatMinutesToLabel(classBlock.endMinutes)}
                      </div>
                      {classBlock.columnCount === 1 && (
                        <div className="class-location">{classBlock.location}</div>
                      )}
                    </MotionDiv>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agenda list: the mobile-friendly view of the same schedule. */}
      <div className="calendar-agenda" aria-label="Schedule by day">
        {days.map((day) => {
          const dayBlocks = [...(blocksByDay[day] || [])].sort(
            (a, b) => a.startMinutes - b.startMinutes
          );
          if (dayBlocks.length === 0) return null;
          return (
            <section key={day} className="agenda-day">
              <h3 className="agenda-day-title">{day}</h3>
              <div className="agenda-items">
                {dayBlocks.map((classBlock) => {
                  const layoutId = `sched-agenda-${classBlock.meetingId}`;
                  const color =
                    classBlock.course.scheduleColor || colorForCrn(classBlock.crn);
                  return (
                    <MotionButton
                      key={classBlock.meetingId}
                      layoutId={layoutId}
                      transition={MORPH}
                      type="button"
                      className="agenda-item"
                      onClick={() => openDetails(classBlock, layoutId)}
                    >
                      <span className="agenda-color" style={{ backgroundColor: color }} aria-hidden />
                      <div className="agenda-time">
                        <span>{formatMinutesToLabel(classBlock.startMinutes)}</span>
                        <span className="agenda-time-end">
                          {formatMinutesToLabel(classBlock.endMinutes)}
                        </span>
                      </div>
                      <div className="agenda-info">
                        <span className="agenda-code">{classBlock.courseCode}</span>
                        <span className="agenda-title">
                          {decodeHtmlEntities(classBlock.courseTitle)}
                        </span>
                        <span className="agenda-location">{classBlock.location}</span>
                      </div>
                      <Icon name="chevronDown" size={16} className="agenda-chevron" aria-hidden />
                    </MotionButton>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <ScheduleClassDetails
            course={selected.course}
            layoutId={selected.layoutId}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default ScheduleCalendar;
