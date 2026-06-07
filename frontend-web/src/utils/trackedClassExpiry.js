// Mirrors the backend WatchedClassExpiryPolicy (service/WatchedClassExpiryPolicy.java).
// Keep the rule in sync: a tracked class expires 2 months after its term starts, and we
// warn on the card during the final WARN_LEAD_DAYS days before that.
//
// GSU term codes are YYYYMM of the term's start month (01=Spring, 05=Summer, 08=Fall).

const EXPIRY_MONTHS_AFTER_START = 2
export const WARN_LEAD_DAYS = 14

/** @returns {Date|null} the date a class for `term` is cleared, or null if malformed. */
export function expiryDate(term) {
  if (!term || String(term).length !== 6) return null
  const year = Number(String(term).slice(0, 4))
  const month = Number(String(term).slice(4, 6)) // 1-based
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  // Date month is 0-based; (month - 1) is term start, + EXPIRY_MONTHS_AFTER_START.
  return new Date(year, month - 1 + EXPIRY_MONTHS_AFTER_START, 1)
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** True when today is within the final WARN_LEAD_DAYS days before expiry. */
export function isExpiringSoon(term, today = startOfToday()) {
  const expiry = expiryDate(term)
  if (!expiry) return false
  const warnFrom = new Date(expiry)
  warnFrom.setDate(warnFrom.getDate() - WARN_LEAD_DAYS)
  return today >= warnFrom && today < expiry
}

/** Human-friendly expiry date, e.g. "Apr 1". */
export function formatExpiry(term) {
  const expiry = expiryDate(term)
  if (!expiry) return ''
  return expiry.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
