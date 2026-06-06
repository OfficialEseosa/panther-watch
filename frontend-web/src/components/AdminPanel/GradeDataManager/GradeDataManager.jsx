import { useState, useEffect, useCallback, useRef } from 'react'
import Icon from '../../Icon'
import { adminService } from '../../../config/adminService'
import { termLabel } from '../../CourseGrades/gradeUtils'
import './GradeDataManager.css'

/**
 * Admin control for the scraped course grade-distribution dataset: shows coverage
 * (sections stored, terms on file) and lets an admin kick off a refresh. While a
 * refresh runs on the backend, the status polls so the panel reflects progress.
 */
export function GradeDataManager() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [message, setMessage] = useState(null)
  const pollRef = useRef(null)

  const loadStatus = useCallback(async () => {
    try {
      const data = await adminService.getGradeStatus()
      setStatus(data)
      return data
    } catch {
      setMessage('Failed to load grade data status.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Poll while a refresh is running so the counts/terms update live.
  useEffect(() => {
    if (status?.running) {
      pollRef.current = setInterval(loadStatus, 5000)
      return () => clearInterval(pollRef.current)
    }
    clearInterval(pollRef.current)
    return undefined
  }, [status?.running, loadStatus])

  const handleRefresh = async () => {
    try {
      setTriggering(true)
      setMessage(null)
      const res = await adminService.refreshGradeDistributions()
      setMessage(res?.message || 'Refresh requested.')
      await loadStatus()
    } catch {
      setMessage('Failed to start refresh.')
    } finally {
      setTriggering(false)
    }
  }

  const running = status?.running
  const terms = status?.terms || []
  const totalSections = status?.totalSections ?? 0
  const busy = running || triggering

  return (
    <div className="grade-data-manager">
      <div className="gdm-head">
        <div className="gdm-title">
          <Icon name="analytics" size={22} aria-hidden />
          <div>
            <h2>Grade data</h2>
            <p>Historical course grade distributions scraped from GSU APEX.</p>
          </div>
        </div>
        <button type="button" className="gdm-refresh" onClick={handleRefresh} disabled={busy}>
          {busy ? (<><span className="gdm-spinner" aria-hidden /> Refreshing…</>) : 'Refresh now'}
        </button>
      </div>

      {loading ? (
        <p className="gdm-muted">Loading status…</p>
      ) : (
        <>
          <div className="gdm-stats">
            <div className="gdm-stat">
              <span className="gdm-stat-value">{totalSections.toLocaleString()}</span>
              <span className="gdm-stat-label">Sections stored</span>
            </div>
            <div className="gdm-stat">
              <span className="gdm-stat-value">{terms.length}</span>
              <span className="gdm-stat-label">Terms on file</span>
            </div>
            <div className="gdm-stat">
              <span className={`gdm-status-pill ${running ? 'is-running' : 'is-idle'}`}>
                {running ? 'Refreshing' : 'Idle'}
              </span>
              <span className="gdm-stat-label">Scraper</span>
            </div>
          </div>

          {terms.length > 0 && (
            <div className="gdm-terms">
              <span className="gdm-terms-label">Terms covered</span>
              <div className="gdm-term-chips">
                {terms.map((t) => (
                  <span key={t} className="gdm-term-chip">{termLabel(t)}</span>
                ))}
              </div>
            </div>
          )}

          {running && (
            <p className="gdm-note">
              A refresh is in progress. Recent terms are scraped first, so newly-taught
              sections appear within a couple of minutes; a full refresh takes ~10 minutes.
            </p>
          )}

          {message && <p className="gdm-message">{message}</p>}
        </>
      )}
    </div>
  )
}

export default GradeDataManager
