import { useEffect, useState } from 'react'
import { ratingService } from '../config/ratingService.js'

/**
 * Loads the RateMyProfessors summary for an instructor. Returns { rating,
 * loading }. `rating` is null while loading / on error, and has found:false when
 * the professor has no RMP profile. Safe to call from every card: the service
 * caches per professor for the session.
 */
export function useProfessorRatings({ instructor, enabled = true }) {
  const [rating, setRating] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !instructor || instructor === 'TBA') {
      setRating(null)
      return
    }

    let active = true
    setLoading(true)
    ratingService
      .getProfessorRating(instructor)
      .then((data) => {
        if (active) setRating(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [instructor, enabled])

  return { rating, loading }
}

export default useProfessorRatings
