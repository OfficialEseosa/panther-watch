import { useState } from 'react'
import UserCard from './UserCard'
import SearchControls from './SearchControls'
import './UserSearchSection.css'

function UserSearchSection({ users, onSearch, onSendEmail }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState(new Set())

  const handleSearchChange = (query) => {
    setSearchQuery(query)
    onSearch(query)
  }

  const handleUserSelect = (userId) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(users.map(user => user.id)))
    }
  }

  return (
    <div className="user-search-section">
      <div className="search-header">
        <h2 className="section-title">🔍 User Management</h2>
        <SearchControls
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          users={users}
          selectedUsers={selectedUsers}
          onSelectAll={handleSelectAll}
        />
      </div>

      <div className="users-container">
        {users.length === 0 ? (
          <div className="no-users">
            <div className="no-users-icon">👤</div>
            <p>No users found</p>
            {searchQuery && <p>Try a different search term</p>}
          </div>
        ) : (
          <div className="users-grid">
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                isSelected={selectedUsers.has(user.id)}
                onSelect={() => handleUserSelect(user.id)}
                onSendEmail={() => onSendEmail(user)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default UserSearchSection
