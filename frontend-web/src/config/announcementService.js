import { API_BASE_URL } from './apiConfig'

class AnnouncementService {
  async getActiveAnnouncements() {
    try {
      const response = await fetch(`${API_BASE_URL}/announcements/active`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch announcements')
      }

      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('Error fetching active announcements:', error)
      return []
    }
  }

  async getAllAnnouncements(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/announcements`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch announcements')
      }

      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('Error fetching announcements:', error)
      throw error
    }
  }

  async createAnnouncement(announcement, token) {
    try {
      const response = await fetch(`${API_BASE_URL}/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(announcement),
      })

      if (!response.ok) {
        throw new Error('Failed to create announcement')
      }

      const result = await response.json()
      return result.data
    } catch (error) {
      console.error('Error creating announcement:', error)
      throw error
    }
  }

  async updateAnnouncement(id, announcement, token) {
    try {
      const response = await fetch(`${API_BASE_URL}/announcements/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(announcement),
      })

      if (!response.ok) {
        throw new Error('Failed to update announcement')
      }

      const result = await response.json()
      return result.data
    } catch (error) {
      console.error('Error updating announcement:', error)
      throw error
    }
  }

  async deleteAnnouncement(id, token) {
    try {
      const response = await fetch(`${API_BASE_URL}/announcements/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete announcement')
      }

      return true
    } catch (error) {
      console.error('Error deleting announcement:', error)
      throw error
    }
  }

  async deactivateAnnouncement(id, token) {
    try {
      const response = await fetch(`${API_BASE_URL}/announcements/${id}/deactivate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to deactivate announcement')
      }

      return true
    } catch (error) {
      console.error('Error deactivating announcement:', error)
      throw error
    }
  }
}

export const announcementService = new AnnouncementService()
