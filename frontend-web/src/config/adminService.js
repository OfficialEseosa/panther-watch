import { buildApiUrl } from './apiConfig.js'
import { authService } from './authService.js'

class AdminService {
  constructor() {
    this.baseUrl = buildApiUrl('/admin')
  }

  async getAuthHeaders() {
    const session = await authService.getSession()
    if (!session?.access_token) {
      throw new Error('No authentication token available')
    }
    
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  }

  async checkAdminStatus() {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/check`, {
        method: 'GET',
        headers,
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error checking admin status:', error)
      return false
    }
  }

  async searchUsers(query) {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/users/search`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ query })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error searching users:', error)
      throw error
    }
  }

  async getAllUsers() {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/users`, {
        method: 'GET',
        headers,
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error getting all users:', error)
      throw error
    }
  }

  async getGradeStatus() {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/grades/status`, {
        method: 'GET',
        headers,
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error getting grade status:', error)
      throw error
    }
  }

  async refreshGradeDistributions() {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/grades/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error refreshing grade distributions:', error)
      throw error
    }
  }

  async sendCustomEmail(targetEmail, subject, message) {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/email/send`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          targetEmail,
          subject,
          message
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error sending custom email:', error)
      throw error
    }
  }
}

export const adminService = new AdminService()
