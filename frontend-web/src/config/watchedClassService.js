import { API_BASE_URL } from './apiConfig.js'
import { authService } from './authService.js'

export class WatchedClassService {
  constructor() {
    this.baseUrl = `${API_BASE_URL}/watched-classes`
  }

  async getWatchedClasses() {
    try {
      const response = await fetch(`${this.baseUrl}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to get watched classes')
      }

      return result.data
    } catch (error) {
      console.error('Get watched classes error:', error)
      throw error
    }
  }

  async addWatchedClass(classData) {
    try {
      const response = await fetch(`${this.baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(classData)
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to add class to watch list')
      }

      return result.data
    } catch (error) {
      console.error('Add watched class error:', error)
      throw error
    }
  }

  async removeWatchedClass(crn, term) {
    try {
      const response = await fetch(
        `${this.baseUrl}?crn=${encodeURIComponent(crn)}&term=${encodeURIComponent(term)}`, 
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        }
      )

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to remove class from watch list')
      }

      return result.success
    } catch (error) {
      console.error('Remove watched class error:', error)
      throw error
    }
  }

  async isWatchingClass(crn, term) {
    try {
      const response = await fetch(
        `${this.baseUrl}/check?crn=${encodeURIComponent(crn)}&term=${encodeURIComponent(term)}`, 
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        }
      )

      const result = await response.json()
      
      if (!response.ok) {
        console.error('Check watch status failed:', result.message)
        return false
      }

      return result.isWatching
    } catch (error) {
      console.error('Check watch status error:', error)
      return false
    }
  }

  async getWatchedClassCount() {
    try {
      const response = await fetch(`${this.baseUrl}/count`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      const result = await response.json()
      
      if (!response.ok) {
        console.error('Get watch count failed:', result.message)
        return 0
      }

      return result.count
    } catch (error) {
      console.error('Get watch count error:', error)
      return 0
    }
  }

  async getWatchedClassesWithFullDetails() {
    try {
      const response = await fetch(`${this.baseUrl}/full-details`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to get watched classes with full details')
      }

      return result.data
    } catch (error) {
      console.error('Get watched classes with full details error:', error)
      throw error
    }
  }
}

export const watchedClassService = new WatchedClassService()
