import Icon from '../../Icon'

function SearchControls({ searchQuery, onSearchChange, users, selectedUsers, onSelectAll }) {
  const handleSearchChange = (e) => {
    onSearchChange(e.target.value)
  }

  const allSelected = users.length > 0 && selectedUsers.size === users.length

  return (
    <div className="search-controls">
      <label className="search-input-container">
        <span className="sr-only">Search users</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search by name or email"
          value={searchQuery}
          onChange={handleSearchChange}
        />
        <Icon name="search" size={16} className="search-icon" aria-hidden />
      </label>

      {users.length > 0 && (
        <div className="bulk-actions">
          <button
            type="button"
            className="select-all-btn"
            onClick={onSelectAll}
          >
            <Icon name={allSelected ? 'remove' : 'check'} size={14} aria-hidden />
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className="selection-count">{selectedUsers.size} selected</span>
        </div>
      )}
    </div>
  )
}

export default SearchControls

