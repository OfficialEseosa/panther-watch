import { coarseCounts, totalGraded } from './gradeUtils'
import './gradeStyles.css'

/**
 * Horizontal stacked A-F distribution bar. Segments are sized by share of total
 * grades and colored per bucket (see CourseGrades.css .grade-seg-{A..F}).
 */
function GradeBar({ gradeCounts, showLabels = false, height = 8 }) {
  const total = totalGraded(gradeCounts)
  if (!total) return null

  const buckets = coarseCounts(gradeCounts)

  return (
    <div className="grade-bar-wrap">
      <div className="grade-bar" style={{ height }} role="img" aria-label="Grade distribution">
        {buckets.map((b) => {
          const pct = (b.count / total) * 100
          if (pct === 0) return null
          return (
            <span
              key={b.key}
              className={`grade-seg grade-seg-${b.key}`}
              style={{ width: `${pct}%` }}
              title={`${b.label}: ${b.count} (${pct.toFixed(0)}%)`}
            />
          )
        })}
      </div>
      {showLabels && (
        <div className="grade-bar-legend">
          {buckets.map((b) => (
            <span key={b.key} className="grade-legend-item">
              <span className={`grade-dot grade-seg-${b.key}`} />
              {b.label} {total ? Math.round((b.count / total) * 100) : 0}%
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default GradeBar
