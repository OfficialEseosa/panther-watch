import { API_BASE_URL } from './apiConfig'

// Syllabus availability is looked up per term + CRN. A section's syllabus doesn't
// change within a session, so a simple in-memory cache avoids refetching as cards
// re-render or the expanded card reopens.
const cache = new Map()
const REQUEST_TIMEOUT_MS = 15_000

const keyFor = (term, crn) => `${term || ''}|${crn || ''}`

class SyllabusService {
  async getSyllabus({ term, crn }) {
    if (!term || !crn) return null

    const key = keyFor(term, crn)
    if (cache.has(key)) return cache.get(key)

    const params = new URLSearchParams({ term, crn })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${API_BASE_URL}/courses/syllabus?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Syllabus lookup failed (${response.status})`)
      const data = await response.json()
      cache.set(key, data)
      return data
    } catch (error) {
      // A missing syllabus shouldn't break the card; callers treat null as "no data".
      console.error('Error fetching syllabus:', error)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

export const syllabusService = new SyllabusService()
