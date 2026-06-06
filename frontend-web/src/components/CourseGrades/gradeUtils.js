// Shared helpers for rendering grade distributions on the course card and in the
// expanded modal.

export const FINE_GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'WF']

// Coarse A-F buckets for the compact bar. Fails (F) folds in WF.
export const COARSE_BUCKETS = [
  { key: 'A', label: 'A', parts: ['A+', 'A', 'A-'] },
  { key: 'B', label: 'B', parts: ['B+', 'B', 'B-'] },
  { key: 'C', label: 'C', parts: ['C+', 'C', 'C-'] },
  { key: 'D', label: 'D', parts: ['D'] },
  { key: 'F', label: 'F', parts: ['F', 'WF'] },
]

export function coarseCounts(gradeCounts = {}) {
  return COARSE_BUCKETS.map((bucket) => ({
    ...bucket,
    count: bucket.parts.reduce((sum, p) => sum + (gradeCounts[p] || 0), 0),
  }))
}

export function totalGraded(gradeCounts = {}) {
  return FINE_GRADE_ORDER.reduce((sum, k) => sum + (gradeCounts[k] || 0), 0)
}

// GPA color tone, mirrored by CSS classes (gpa-tone-{tone}).
export function gpaTone(gpa) {
  if (gpa == null) return 'unknown'
  if (gpa >= 3.5) return 'high'
  if (gpa >= 3.0) return 'good'
  if (gpa >= 2.5) return 'mid'
  return 'low'
}

// DWF% tone (higher is worse).
export function dwfTone(pct) {
  if (pct == null) return 'unknown'
  if (pct >= 30) return 'low'
  if (pct >= 20) return 'mid'
  if (pct >= 10) return 'good'
  return 'high'
}

export function formatGpa(gpa) {
  return gpa == null ? '—' : gpa.toFixed(2)
}

export function formatPercent(pct) {
  return pct == null ? '—' : `${pct.toFixed(1)}%`
}

// Human-readable term label from a GSU term code like "202508" -> "Fall 2025".
const SEASONS = { '01': 'Spring', '05': 'Summer', '08': 'Fall' }
export function termLabel(code) {
  if (!code || code.length !== 6) return code || ''
  const year = code.slice(0, 4)
  const season = SEASONS[code.slice(4)] || ''
  return season ? `${season} ${year}` : code
}

// Caption like "5 semesters · Fall 2023–Fall 2025" for a list of term codes
// (newest first, as returned by the backend).
export function semesterSpan(terms = []) {
  if (!terms.length) return ''
  const count = `${terms.length} semester${terms.length !== 1 ? 's' : ''}`
  const newest = termLabel(terms[0])
  const oldest = termLabel(terms[terms.length - 1])
  const range = terms.length === 1 ? newest : `${oldest}–${newest}`
  return `${count} · ${range}`
}

// Normalize a professor name to a "last|first" key, mirroring the backend
// (GradeDistributionService.normalizeName) so the frontend can match GoSolar's
// messy display names ("Nemira, Alina (Alina) ") against the grade data.
export function normalizeName(raw) {
  if (!raw) return ''
  const s = raw.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\./g, '').trim()
  let last
  let first
  if (s.includes(',')) {
    const [l, rest = ''] = s.split(/,(.*)/s)
    last = l.trim()
    first = rest.trim().split(/\s+/)[0] || ''
  } else {
    const tokens = s.split(/\s+/)
    last = tokens[tokens.length - 1]
    first = tokens[0]
  }
  last = last.replace(/[^a-z\s-]/g, '').replace(/\s+/g, ' ').trim()
  first = first.replace(/[^a-z-]/g, '')
  return `${last}|${first}`
}
