import { useState } from 'react'
import Icon from '../../Icon'
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
    const nextSelected = new Set(selectedUsers)
    if (nextSelected.has(userId)) {
      nextSelected.delete(userId)
    } else {
      nextSelected.add(userId)
    }
    setSelectedUsers(nextSelected)
  }

  const handleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(users.map(user => user.id)))
    }
  }

  return (
    <section className="user-search-section" aria-labelledby="admin-user-management">
      <header className="search-header">
        <div className="section-heading">
          <Icon name="users" size={18} className="section-icon" aria-hidden />
          <h2 id="admin-user-management" className="section-title">User management</h2>
        </div>
        <SearchControls
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          users={users}
          selectedUsers={selectedUsers}
          onSelectAll={handleSelectAll}
        />
      </header>

      <div className="users-container">
        {users.length === 0 ? (
          <div className="no-users" role="status" aria-live="polite">
            <Icon name="search" size={32} className="no-users-icon" aria-hidden />
            <p>No users found</p>
            {searchQuery && <p>Try a different search term.</p>}
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
    </section>
  )
}

export default UserSearchSection

