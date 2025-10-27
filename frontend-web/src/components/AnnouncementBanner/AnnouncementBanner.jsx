import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '../Icon'
import { announcementService } from '../../config/announcementService'
import './AnnouncementBanner.css'

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [dismissed, setDismissed] = useState(new Set())
  const bannerRef = useRef(null)

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await announcementService.getActiveAnnouncements()
      const activeDismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]')
      const filtered = data.filter(a => !activeDismissed.includes(a.id))
      setAnnouncements(filtered)
      setDismissed(new Set(activeDismissed))
    } catch (error) {
      console.error('Failed to load announcements:', error)
    }
  }, [])

  useEffect(() => {
    loadAnnouncements()
    const interval = setInterval(loadAnnouncements, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadAnnouncements])

  useEffect(() => {
    const subscription = announcementService.subscribeToUpdates(() => {
      loadAnnouncements()
    })

    return () => {
      if (subscription?.close) {
        subscription.close()
      }
    }
  }, [loadAnnouncements])

  useEffect(() => {
    if (announcements.length > 1) {
      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % announcements.length)
      }, 10000) // Rotate every 10 seconds
      return () => clearInterval(timer)
    }
  }, [announcements.length])

  useEffect(() => {
    const root = document.documentElement

    if (announcements.length === 0) {
      root.style.setProperty('--announcement-banner-height', '0px')
      return
    }

    const updateHeight = () => {
      if (bannerRef.current) {
        root.style.setProperty('--announcement-banner-height', `${bannerRef.current.offsetHeight}px`)
      }
    }

    updateHeight()

    let observer = null
    if (bannerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateHeight())
      observer.observe(bannerRef.current)
    }

    return () => {
      if (observer) {
        observer.disconnect()
      }
    }
  }, [announcements])

  useEffect(() => {
    return () => {
      document.documentElement.style.setProperty('--announcement-banner-height', '0px')
    }
  }, [])

  const handleDismiss = (id) => {
    const newDismissed = new Set(dismissed)
    newDismissed.add(id)
    setDismissed(newDismissed)
    
    // Save to localStorage
    localStorage.setItem('dismissed_announcements', JSON.stringify([...newDismissed]))
    
    // Remove from current announcements
    setAnnouncements(prev => prev.filter(a => a.id !== id))
    
    // Reset index if needed
    if (currentIndex >= announcements.length - 1) {
      setCurrentIndex(0)
    }
  }

  if (announcements.length === 0) {
    return null
  }

  const currentAnnouncement = announcements[currentIndex]
  const typeIcon = {
    info: 'notifications',
    warning: 'alertTriangle',
    error: 'alertTriangle'
  }[currentAnnouncement.type] || 'notifications'

  return (
    <div
      ref={bannerRef}
      className={`announcement-banner announcement-banner--${currentAnnouncement.type}`}
    >
      <div className="announcement-banner__content">
        <Icon name={typeIcon} className="announcement-banner__icon" />
        <div className="announcement-banner__message">
          {currentAnnouncement.message}
        </div>
        {announcements.length > 1 && (
          <div className="announcement-banner__indicator">
            {announcements.map((_, index) => (
              <button
                key={index}
                className={`announcement-banner__dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Show announcement ${index + 1}`}
              />
            ))}
          </div>
        )}
        <button
          className="announcement-banner__close"
          onClick={() => handleDismiss(currentAnnouncement.id)}
          aria-label="Dismiss announcement"
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  )
}
