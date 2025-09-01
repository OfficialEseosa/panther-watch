function SearchControls({ searchQuery, onSearchChange, users, selectedUsers, onSelectAll }) {
  const handleSearchChange = (e) => {
    onSearchChange(e.target.value)
  }

  return (
    <div className="search-controls">
      <div className="search-input-container">
        <input
          type="text"
          className="search-input"
          placeholder="Search users by name or email..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
        <div className="search-icon">🔍</div>
      </div>
      {users.length > 0 && (
        <div className="bulk-actions">
          <button
            className="select-all-btn"
            onClick={onSelectAll}
          >
            {selectedUsers.size === users.length ? 'Deselect All' : 'Select All'}
          </button>
          <span className="selection-count">
            {selectedUsers.size} selected
          </span>
        </div>
      )}
    </div>
  )
}

export default SearchControls
