import { API_BASE_URL } from './apiConfig.js'
import { authService } from './authService.js'

const REQUEST_TIMEOUT_MS = 30_000
const FULL_DETAILS_TIMEOUT_MS = 35_000
const RETRY_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 400
// Hard ceiling for serving stale cache during backend outages. Beyond this we
// throw rather than show day-old tracked classes as if they were current.
const STALE_FALLBACK_MAX_MS = 24 * 60 * 60 * 1000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export class WatchedClassService {
  constructor() {
    this.baseUrl = `${API_BASE_URL}/watched-classes`
    this.watchedClassesCache = null
    this.watchedCountCache = null
    this.cacheTimestamp = null
    this.CACHE_DURATION = 5 * 60 * 1000
  }

  clearCache() {
    this.watchedClassesCache = null
    this.watchedCountCache = null
    this.cacheTimestamp = null
  }

  isCacheValid() {
    return this.cacheTimestamp && (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION
  }

  isCacheWithinStaleWindow() {
    return this.cacheTimestamp && (Date.now() - this.cacheTimestamp) < STALE_FALLBACK_MAX_MS
  }

  async makeAuthenticatedRequest(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const token = await authService.getAccessToken()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, {
        ...options,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          ...options.headers
        }
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async requestJsonWithRetry(url, options = {}, { timeoutMs = REQUEST_TIMEOUT_MS, attempts = RETRY_ATTEMPTS } = {}) {
    let lastError
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await this.makeAuthenticatedRequest(url, options, timeoutMs)
        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(result.message || `HTTP ${response.status}`)
        }
        return result
      } catch (err) {
        lastError = err
        if (i < attempts - 1) {
          await sleep(RETRY_BACKOFF_MS * Math.pow(2, i))
        }
      }
    }
    throw lastError
  }

  async getWatchedClasses() {
    if (Array.isArray(this.watchedClassesCache) && this.isCacheValid()) {
      return this.watchedClassesCache
    }

    try {
      const result = await this.requestJsonWithRetry(this.baseUrl)
      const data = Array.isArray(result.data) ? result.data : []
      // Only cache real data — never cache empty arrays from a transient error,
      // and never cache nullish payloads. This avoids the "stale null sticks for an hour" bug.
      if (data.length > 0) {
        this.watchedClassesCache = data
        this.cacheTimestamp = Date.now()
      }
      return data
    } catch (error) {
      console.error('Get watched classes error:', error)
      // If we have a recent cache, prefer that over throwing — the UI should not
      // go blank for a transient backend hiccup. But never serve cache older than
      // STALE_FALLBACK_MAX_MS; at that point the user deserves the real error.
      if (Array.isArray(this.watchedClassesCache) && this.isCacheWithinStaleWindow()) {
        return this.watchedClassesCache
      }
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
    if (typeof this.watchedCountCache === 'number' && this.isCacheValid()) {
      return this.watchedCountCache
    }

    try {
      const result = await this.requestJsonWithRetry(`${this.baseUrl}/count`)
      const count = typeof result.count === 'number' ? result.count : 0
      this.watchedCountCache = count
      this.cacheTimestamp = Date.now()
      return count
    } catch (error) {
      console.error('Get watch count error:', error)
      if (typeof this.watchedCountCache === 'number' && this.isCacheWithinStaleWindow()) {
        return this.watchedCountCache
      }
      return 0
    }
  }

  async getWatchedClassesWithFullDetails() {
    try {
      const result = await this.requestJsonWithRetry(
        `${this.baseUrl}/full-details`,
        {},
        { timeoutMs: FULL_DETAILS_TIMEOUT_MS, attempts: 2 }
      )
      return Array.isArray(result.data) ? result.data : []
    } catch (error) {
      console.error('Get watched classes with full details error:', error)
      throw error
    }
  }
}

export const watchedClassService = new WatchedClassService()
