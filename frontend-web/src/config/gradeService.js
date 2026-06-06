import { API_BASE_URL } from './apiConfig'

// Grade history is historical data that only changes when a term's grades post,
// so an in-memory cache for the session is plenty and avoids refetching as the
// same course/professor cards re-render.
const cache = new Map()
const REQUEST_TIMEOUT_MS = 15_000

const keyFor = (subject, courseNumber, instructor) =>
  `${subject}|${courseNumber}|${instructor || ''}`.toUpperCase()

class GradeService {
  async getCourseGrades({ subject, courseNumber, instructor }) {
    if (!subject || !courseNumber) return null

    const key = keyFor(subject, courseNumber, instructor)
    if (cache.has(key)) return cache.get(key)

    const params = new URLSearchParams({ subject, courseNumber })
    if (instructor) params.set('instructor', instructor)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${API_BASE_URL}/courses/grades?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Grade lookup failed (${response.status})`)
      const data = await response.json()
      cache.set(key, data)
      return data
    } catch (error) {
      // A missing grade history shouldn't break the card; callers treat null as "no data".
      console.error('Error fetching grade distribution:', error)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

export const gradeService = new GradeService()
