import Icon from '../Icon';
import SubjectAutocomplete from '../SubjectAutocomplete';

function AddClassesModal({
  isOpen,
  onClose,
  addMode,
  setAddMode,
  availableTerms,
  selectedTermLabel,
  trackedClasses,
  detailsLoading,
  isCourseScheduled,
  addCourseToSchedule,
  searchForm,
  onSearchInputChange,
  onSearchSubmit,
  searchResults,
  searchLoading,
  searchError,
  resetSearchState,
  onNavigateToTracked,
  buildMeetingSummaries
}) {
  if (!isOpen) {
    return null;
  }

  const renderMeetingDetails = (course) => {
    const summaries = buildMeetingSummaries(course);
    return summaries.map((summary) => (
      <div key={summary.id} className="add-modal-meeting">
        <span className="meeting-days">{summary.dayLabel}</span>
        {summary.timeLabel && <span className="meeting-time">{summary.timeLabel}</span>}
        {summary.location && <span className="meeting-location">{summary.location}</span>}
      </div>
    ));
  };

  const renderTrackedTab = () => {
    if (detailsLoading) {
      return <div className="modal-loading">Loading tracked classes…</div>;
    }

    if (trackedClasses.length === 0) {
      return (
        <div className="modal-empty">
          <p>No tracked classes for {selectedTermLabel || 'this term'}.</p>
          <button
            type="button"
            className="modal-link"
            onClick={() => {
              onClose();
              onNavigateToTracked();
            }}
          >
            Manage tracked classes
          </button>
        </div>
      );
    }

    return (
      <div className="add-list" role="list">
        {trackedClasses.map((course) => {
          const scheduled = isCourseScheduled(course);
          return (
            <div
              key={course.courseReferenceNumber}
              className="add-list-item"
              role="listitem"
            >
              <div className="add-list-info">
                <div className="add-list-title">
                  {course.subject} {course.courseNumber}{' '}
                  <span className="add-list-crn">CRN {course.courseReferenceNumber}</span>
                </div>
                <div className="add-list-subtitle">{course.courseTitle}</div>
                {renderMeetingDetails(course)}
              </div>
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => addCourseToSchedule(course)}
                disabled={scheduled}
              >
                {scheduled ? 'Added' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSearchResults = () => {
    if (searchLoading) {
      return <div className="modal-loading">Searching for courses…</div>;
    }

    if (searchError) {
      return <div className="modal-error">{searchError}</div>;
    }

    if (searchResults.length === 0) {
      return (
        <div className="modal-empty">
          <p>Run a search to find classes and add them to your schedule.</p>
        </div>
      );
    }

    return (
      <div className="add-list" role="list">
        {searchResults.map((course) => {
          const scheduled = isCourseScheduled(course);
          return (
            <div
              key={`${course.courseReferenceNumber}-${course.term}`}
              className="add-list-item"
              role="listitem"
            >
              <div className="add-list-info">
                <div className="add-list-title">
                  {course.subject} {course.courseNumber}{' '}
                  <span className="add-list-crn">CRN {course.courseReferenceNumber}</span>
                </div>
                <div className="add-list-subtitle">{course.courseTitle}</div>
                {renderMeetingDetails(course)}
              </div>
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => addCourseToSchedule(course)}
                disabled={scheduled}
              >
                {scheduled ? 'Added' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="schedule-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="schedule-modal"
        role="document"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="schedule-modal-header">
          <h2 className="schedule-modal-title">Add Classes</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="schedule-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={addMode === 'tracked'}
            className={`modal-tab ${addMode === 'tracked' ? 'is-active' : ''}`}
            onClick={() => {
              setAddMode('tracked');
              resetSearchState();
            }}
          >
            From tracked classes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={addMode === 'search'}
            className={`modal-tab ${addMode === 'search' ? 'is-active' : ''}`}
            onClick={() => setAddMode('search')}
          >
            Search catalog
          </button>
        </div>

        <div className="schedule-modal-body">
          {addMode === 'tracked' ? (
            renderTrackedTab()
          ) : (
            <div className="modal-search">
              <form className="modal-search-form" onSubmit={onSearchSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span className="form-label">Term</span>
                    <select
                      name="term"
                      value={searchForm.term}
                      onChange={onSearchInputChange}
                      required
                    >
                      <option value="">Select term</option>
                      {availableTerms.map((term) => (
                        <option key={term.code} value={term.code}>
                          {term.description}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-field">
                    <span className="form-label">Subject</span>
                    <SubjectAutocomplete
                      selectedTerm={searchForm.term}
                      value={searchForm.subject}
                      onChange={(value) => {
                        onSearchInputChange({
                          target: { name: 'subject', value }
                        });
                      }}
                      placeholder="Select subject"
                      required={true}
                      isSingleSelect={true}
                    />
                  </div>
                  <label className="form-field">
                    <span className="form-label">Course number</span>
                    <input
                      type="text"
                      name="courseNumber"
                      value={searchForm.courseNumber}
                      onChange={onSearchInputChange}
                      placeholder="e.g. 1301"
                      required
                    />
                  </label>
                </div>
                <div className="modal-actions-row">
                  <button
                    type="submit"
                    className="modal-action-btn primary"
                    disabled={searchLoading}
                  >
                    {searchLoading ? 'Searching…' : 'Search classes'}
                  </button>
                </div>
              </form>

              {renderSearchResults()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AddClassesModal;
