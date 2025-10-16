import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../../components/Icon';
import ScheduleCalendar from '../../components/ScheduleCalendar';
import AddClassesModal from '../../components/AddClassesModal';
import { useSchedulePlanner } from '../../hooks/useSchedulePlanner.js';
import './ScheduleBuilder.css';

function ScheduleBuilder() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    DAYS,
    TIME_SLOTS,
    selectedTerm,
    setSelectedTerm,
    availableTerms,
    selectedTermLabel,
    hasScheduleEntries,
    handleRemoveFromSchedule,
    handleAddToCalendar,
    getClassesForSlot,
    showAddModal,
    setShowAddModal,
    closeAddModal,
    addMode,
    setAddMode,
    trackedClassesForSelectedTerm,
    detailsLoading,
    isCourseScheduled,
    addCourseToSchedule,
    searchForm,
    handleSearchInputChange,
    handleSearchSubmit,
    searchResults,
    searchLoading,
    searchError,
    resetSearchState,
    buildMeetingSummaries,
    formatMinutesToLabel,
    isLoading
  } = useSchedulePlanner(location.search);

  const handleOpenAddModal = (mode = 'tracked') => {
    resetSearchState();
    setAddMode(mode);
    setShowAddModal(true);
  };

  if (isLoading) {
    return (
      <div className="schedule-builder">
        <div className="loading-state">Loading schedule...</div>
      </div>
    );
  }

  return (
    <div className="schedule-builder">
      <header className="schedule-header">
        <div className="header-top">
          <button onClick={() => navigate('/dashboard')} className="back-button">
            <Icon name="chevronDown" size={16} className="back-icon" />
            Back
          </button>
        </div>
        <div className="header-content">
          <div className="header-text">
            <h1 className="schedule-title">Class Schedule</h1>
            <p className="schedule-description">
              View your weekly class schedule. Add tracked classes or search the catalog to build your plan.
            </p>
          </div>
          <div className="header-actions">
            <select
              className="term-selector"
              value={selectedTerm || ''}
              onChange={(event) => setSelectedTerm(event.target.value)}
            >
              {availableTerms.map((term) => (
                <option key={term.code} value={term.code}>
                  {term.description}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary add-classes-btn"
              onClick={() => handleOpenAddModal('tracked')}
            >
              Add classes
            </button>
            <button
              className="btn-primary"
              onClick={handleAddToCalendar}
              disabled={!hasScheduleEntries}
            >
              <Icon name="calendar" size={18} />
              Export to calendar
            </button>
          </div>
        </div>
      </header>

      <div className="schedule-container">
        <ScheduleCalendar
          days={DAYS}
          timeSlots={TIME_SLOTS}
          getClassesForSlot={getClassesForSlot}
          onRemove={handleRemoveFromSchedule}
          formatMinutesToLabel={formatMinutesToLabel}
        />

        {!hasScheduleEntries && (
          <div className="empty-schedule">
            <Icon name="calendar" size={48} />
            <h3>No classes scheduled</h3>
            <p>Add classes from your tracked list to see them on your calendar.</p>
            <button
              className="btn-secondary"
              onClick={() => navigate('/tracked-classes')}
            >
              <Icon name="bookmark" size={16} />
              View tracked classes
            </button>
          </div>
        )}
      </div>

      <AddClassesModal
        isOpen={showAddModal}
        onClose={closeAddModal}
        addMode={addMode}
        setAddMode={setAddMode}
        availableTerms={availableTerms}
        selectedTermLabel={selectedTermLabel}
        trackedClasses={trackedClassesForSelectedTerm}
        detailsLoading={detailsLoading}
        isCourseScheduled={isCourseScheduled}
        addCourseToSchedule={addCourseToSchedule}
        searchForm={searchForm}
        onSearchInputChange={handleSearchInputChange}
        onSearchSubmit={handleSearchSubmit}
        searchResults={searchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        resetSearchState={resetSearchState}
        onNavigateToTracked={() => navigate('/tracked-classes')}
        buildMeetingSummaries={buildMeetingSummaries}
      />
    </div>
  );
}

export default ScheduleBuilder;
