import { API_BASE_URL } from './apiConfig.js'
import { authService } from './authService.js'

export class WatchedClassService {
  constructor() {
    this.baseUrl = `${API_BASE_URL}/watched-classes`
    this.watchedClassesCache = null
    this.watchedCountCache = null
    this.cacheTimestamp = null
    this.CACHE_DURATION = 60 * 60 * 1000
  }

  clearCache() {
    this.watchedClassesCache = null
    this.watchedCountCache = null
    this.cacheTimestamp = null
  }

  isCacheValid() {
    return this.cacheTimestamp && (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION
  }

  async makeAuthenticatedRequest(url, options = {}) {
    const token = await authService.getAccessToken()
    
    return fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.headers
      }
    })
  }

  async getWatchedClasses() {
    try {
      if (this.watchedClassesCache && this.isCacheValid()) {
        return this.watchedClassesCache
      }

      const response = await this.makeAuthenticatedRequest(this.baseUrl)
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to get watched classes')
      }
      this.watchedClassesCache = result.data
      this.cacheTimestamp = Date.now()

      return result.data
    } catch (error) {
      console.error('Get watched classes error:', error)
      throw error
    }
  }

  async addWatchedClass(classData) {
    try {
      const response = await this.makeAuthenticatedRequest(this.baseUrl, {
        method: 'POST',
        body: JSON.stringify(classData)
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to add class to watch list')
      }

      this.clearCache()

      return result.data
    } catch (error) {
      console.error('Add watched class error:', error)
      throw error
    }
  }

  async removeWatchedClass(crn, term) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}?crn=${encodeURIComponent(crn)}&term=${encodeURIComponent(term)}`,
        { method: 'DELETE' }
      )

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to remove class from watch list')
      }

      this.clearCache()

      return result.success
    } catch (error) {
      console.error('Remove watched class error:', error)
      throw error
    }
  }

  async isWatchingClass(crn, term) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/check?crn=${encodeURIComponent(crn)}&term=${encodeURIComponent(term)}`
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
      if (this.watchedCountCache !== null && this.isCacheValid()) {
        return this.watchedCountCache
      }

      const response = await this.makeAuthenticatedRequest(`${this.baseUrl}/count`)
      const result = await response.json()
      
      if (!response.ok) {
        console.error('Get watch count failed:', result.message)
        return 0
      }

      this.watchedCountCache = result.count
      this.cacheTimestamp = Date.now()

      return result.count
    } catch (error) {
      console.error('Get watch count error:', error)
      return 0
    }
  }

  async getWatchedClassesWithFullDetails() {
    try {
      const response = await this.makeAuthenticatedRequest(`${this.baseUrl}/full-details`)
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
