import { useEffect, useState } from 'react'
import Dashboard from './Dashboard.jsx'
import { useWatchedClasses } from '../../hooks/useWatchedClasses.js'
import pantherLogo from '../../assets/panther.png'
import './Dashboard.css'

function DashboardWrapper() {
  const { loading: watchedLoading } = useWatchedClasses()
  const [showLoader, setShowLoader] = useState(true)

  useEffect(() => {
    if (!watchedLoading) {
      const t = setTimeout(() => setShowLoader(false), 500)
      return () => clearTimeout(t)
    } else {
      setShowLoader(true)
    }
  }, [watchedLoading])

  if (showLoader) {
    return (
      <div className="panther-loader" role="status" aria-live="polite">
        <img src={pantherLogo} alt="PantherWatch logo" className="panther-logo" />
        <p className="loader-text">Loading your dashboard…</p>
      </div>
    )
  }

  return <Dashboard />
}

export default DashboardWrapper

