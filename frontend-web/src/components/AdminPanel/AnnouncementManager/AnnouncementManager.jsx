import { useState, useEffect } from 'react'
import Icon from '../../Icon'
import { announcementService } from '../../../config/announcementService'
import { authService } from '../../../config/authService'
import './AnnouncementManager.css'

export function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [formData, setFormData] = useState({
    message: '',
    type: 'info',
    expiresAt: '',
    active: true,
    createdBy: ''
  })

  const normalizeDatetimeForApi = (value) => {
    if (!value) {
      return null
    }
    const trimmedValue = value.trim()
    if (trimmedValue.length === 16) {
      return `${trimmedValue}:00`
    }
    return trimmedValue
  }

  const formatDateForInput = (value) => {
    if (!value || typeof value !== 'string') {
      return ''
    }
    const trimmedValue = value.trim()
    if (!trimmedValue) {
      return ''
    }
    const isoMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
    if (isoMatch) {
      return isoMatch[1]
    }
    const parsed = new Date(trimmedValue)
    if (Number.isNaN(parsed.getTime())) {
      return ''
    }
    const year = parsed.getFullYear()
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
    const day = `${parsed.getDate()}`.padStart(2, '0')
    const hours = `${parsed.getHours()}`.padStart(2, '0')
    const minutes = `${parsed.getMinutes()}`.padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  useEffect(() => {
    loadAnnouncements()
  }, [])

  const loadAnnouncements = async () => {
    try {
      setLoading(true)
      const token = await authService.getAccessToken()
      const data = await announcementService.getAllAnnouncements(token)
      setAnnouncements(data)
    } catch (error) {
      console.error('Failed to load announcements:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      setError(null)
      const token = await authService.getAccessToken()
      const expiresAt = normalizeDatetimeForApi(formData.expiresAt)

      const announcementData = {
        ...formData,
        expiresAt
      }

      if (editingId) {
        await announcementService.updateAnnouncement(editingId, announcementData, token)
      } else {
        await announcementService.createAnnouncement(announcementData, token)
      }

      setFormData({
        message: '',
        type: 'info',
        expiresAt: '',
        active: true,
        createdBy: ''
      })
      setShowForm(false)
      setEditingId(null)
      
      await loadAnnouncements()
    } catch (error) {
      console.error('Failed to save announcement:', error)
      setError('Failed to save announcement. Please try again.')
    }
  }

  const handleEdit = (announcement) => {
    setFormData({
      message: announcement.message || '',
      type: announcement.type || 'info',
      expiresAt: formatDateForInput(announcement.expiresAt),
      active: Boolean(announcement.active),
      createdBy: announcement.createdBy || ''
    })
    setEditingId(announcement.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    try {
      const token = await authService.getAccessToken()
      await announcementService.deleteAnnouncement(id, token)
      setDeleteConfirmId(null)
      await loadAnnouncements()
    } catch (error) {
      console.error('Failed to delete announcement:', error)
      setError('Failed to delete announcement. Please try again.')
    }
  }

  const handleDeactivate = async (id) => {
    try {
      setError(null)
      const token = await authService.getAccessToken()
      await announcementService.deactivateAnnouncement(id, token)
      await loadAnnouncements()
    } catch (error) {
      console.error('Failed to deactivate announcement:', error)
      setError('Failed to deactivate announcement. Please try again.')
    }
  }

  const handleActivate = async (id) => {
    try {
      setError(null)
      const token = await authService.getAccessToken()
      await announcementService.activateAnnouncement(id, token)
      await loadAnnouncements()
    } catch (error) {
      console.error('Failed to activate announcement:', error)
      setError('Failed to activate announcement. Please try again.')
    }
  }

  const formatDate = (dateString, fallback = 'N/A') => {
    if (!dateString) {
      return fallback
    }
    const parsed = new Date(dateString)
    if (Number.isNaN(parsed.getTime())) {
      return fallback
    }
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const isExpired = (expiresAt) => {
    if (!expiresAt) {
      return false
    }
    const expiryDate = new Date(expiresAt)
    if (Number.isNaN(expiryDate.getTime())) {
      return false
    }
    return expiryDate < new Date()
  }

  if (loading) {
    return <div className="announcement-manager__loading">Loading announcements...</div>
  }

  return (
    <div className="announcement-manager">
      <div className="announcement-manager__header">
        <h2>
          <Icon name="notifications" />
          Announcement Manager
        </h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowForm(!showForm)
            setEditingId(null)
            setError(null)
            setFormData({
              message: '',
              type: 'info',
              expiresAt: '',
              active: true,
              createdBy: ''
            })
          }}
        >
          <Icon name="add" />
          {showForm ? 'Cancel' : 'New Announcement'}
        </button>
      </div>

      {error && (
        <div className="announcement-manager__error">
          <Icon name="alertTriangle" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-close">
            <Icon name="close" />
          </button>
        </div>
      )}

      {showForm && (
        <form className="announcement-manager__form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="message">Message *</label>
            <textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              required
              maxLength={500}
              rows={3}
              placeholder="Enter announcement message..."
            />
            <small>{formData.message.length}/500 characters</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="type">Type *</label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                required
              >
                <option value="info">Info (Blue)</option>
                <option value="warning">Warning (Orange)</option>
                <option value="error">Error (Red)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="expiresAt">Expires At *</label>
              <input
                type="datetime-local"
                id="expiresAt"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                required
                min={new Date().toISOString().substring(0, 16)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="createdBy">Created By</label>
            <input
              type="text"
              id="createdBy"
              value={formData.createdBy}
              onChange={(e) => setFormData({ ...formData, createdBy: e.target.value })}
              placeholder="Your name or identifier"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <span>Active (show on website)</span>
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update' : 'Create'} Announcement
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="announcement-manager__list">
        {announcements.length === 0 ? (
          <div className="announcement-manager__empty">
            <Icon name="notifications" />
            <p>No announcements yet. Create one to get started!</p>
          </div>
        ) : (
          announcements.map((announcement) => (
            <div
              key={announcement.id}
              className={`announcement-card announcement-card--${announcement.type} ${
                !announcement.active ? 'announcement-card--inactive' : ''
              } ${isExpired(announcement.expiresAt) ? 'announcement-card--expired' : ''}`}
            >
              <div className="announcement-card__header">
                <div className="announcement-card__type">
                  <Icon
                    name={
                      announcement.type === 'info'
                        ? 'notifications'
                        : 'alertTriangle'
                    }
                  />
                  <span>{announcement.type.toUpperCase()}</span>
                </div>
                <div className="announcement-card__status">
                  {!announcement.active && <span className="badge badge--inactive">Inactive</span>}
                  {isExpired(announcement.expiresAt) && (
                    <span className="badge badge--expired">Expired</span>
                  )}
                  {announcement.active && !isExpired(announcement.expiresAt) && (
                    <span className="badge badge--active">Active</span>
                  )}
                </div>
              </div>

              <div className="announcement-card__message">{announcement.message}</div>

              <div className="announcement-card__meta">
                <div className="announcement-card__dates">
                  <div>
                    <Icon name="calendar" />
                    <span>Created: {formatDate(announcement.createdAt)}</span>
                  </div>
                  <div>
                    <Icon name="time" />
                    <span>Expires: {formatDate(announcement.expiresAt, 'No expiration')}</span>
                  </div>
                  {announcement.createdBy && (
                    <div>
                      <Icon name="person" />
                      <span>By: {announcement.createdBy}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="announcement-card__actions">
                <button
                  className="btn btn-small btn-secondary"
                  onClick={() => handleEdit(announcement)}
                >
                  <Icon name="create" />
                  Edit
                </button>
                {announcement.active && (
                  <button
                    className="btn btn-small btn-warning"
                    onClick={() => handleDeactivate(announcement.id)}
                  >
                    <Icon name="pause" />
                    Deactivate
                  </button>
                )}
                {!announcement.active && (
                  <button
                    className="btn btn-small btn-success"
                    onClick={() => handleActivate(announcement.id)}
                  >
                    <Icon name="play" />
                    Activate
                  </button>
                )}
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => setDeleteConfirmId(announcement.id)}
                >
                  <Icon name="trash" />
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Announcement</h3>
              <button onClick={() => setDeleteConfirmId(null)} className="modal-close">
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this announcement? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                <Icon name="trash" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
