import { API_BASE_URL } from './apiConfig'

// RateMyProfessors summaries are looked up per professor. The same professor
// often teaches several sections in one search, so a session cache keyed by name
// dedupes those into a single backend call (which itself caches against RMP).
const cache = new Map()
const REQUEST_TIMEOUT_MS = 15_000

const keyFor = (professor) => (professor || '').trim().toUpperCase()

class RatingService {
  async getProfessorRating(professor) {
    if (!professor || professor === 'TBA') return null

    const key = keyFor(professor)
    if (cache.has(key)) return cache.get(key)

    const params = new URLSearchParams({ professor })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${API_BASE_URL}/courses/ratings?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Rating lookup failed (${response.status})`)
      const data = await response.json()
      cache.set(key, data)
      return data
    } catch (error) {
      // Missing ratings shouldn't break the card; callers treat null as "no data".
      console.error('Error fetching professor rating:', error)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

export const ratingService = new RatingService()
