import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import CourseSearch from './pages/CourseSearch'
import CourseResultsPage from './pages/CourseResults'
import TrackedClasses from './pages/TrackedClasses'
import AdminPanel from './pages/Admin'
import Settings from './pages/Settings'
import ScheduleBuilder from './pages/ScheduleBuilder'
import { PrivacyPolicy, TermsOfService } from './pages/Legal'
import DashboardLayout from './layouts/DashboardLayout'
import { TermsProvider } from './contexts/TermsContext.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { WatchedClassesProvider } from './contexts/WatchedClassesContext.jsx'
import { ScheduleProvider } from './contexts/ScheduleContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { TutorialProvider } from './contexts/TutorialContext.jsx'
import { authService } from './config/authService.js'
import './App.css'

// Landing spot for the Google OAuth redirect. authService captures the token from the
// URL fragment on page load (see handleOAuthCallback); here we just send the user on.
function AuthCallback() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/dashboard', { replace: true })
  }, [navigate])
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      Signing you in…
    </div>
  )
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await authService.getSession()
        setIsLoggedIn(!!session)
      } catch (error) {
        console.error('Auth check failed:', error)
        setIsLoggedIn(false)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()

    const { data: { subscription } } = authService.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        setIsLoggedIn(true)
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await authService.logout()
    setIsLoggedIn(false)
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <WatchedClassesProvider>
          <ScheduleProvider>
          <TutorialProvider>
            {loading ? (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
              }}>
                Loading...
              </div>
            ) : (
              <Routes>
                {/* OAuth landing route — token is captured on load, then we redirect. */}
                <Route path="/auth/callback" element={<AuthCallback />} />
                {/* Public legal pages (also used as the Google OAuth consent URLs). */}
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                {/* Guest-accessible: search, results, and the dashboard are open
                    without login. Auth-only features inside them are greyed out. */}
                <Route
                  path="/dashboard"
                  element={
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><Dashboard /></DashboardLayout>
                    </TermsProvider>
                  }
                />
                <Route
                  path="/course-search"
                  element={
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><CourseSearch /></DashboardLayout>
                    </TermsProvider>
                  }
                />
                <Route
                  path="/course-results"
                  element={
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><CourseResultsPage /></DashboardLayout>
                    </TermsProvider>
                  }
                />
                <Route
                  path="/tracked-classes"
                  element={
                    isLoggedIn ?
                      <TermsProvider>
                        <DashboardLayout onLogout={handleLogout}><TrackedClasses /></DashboardLayout>
                      </TermsProvider> :
                      <Navigate to="/" replace />
                  }
                />
                <Route
                  path="/admin"
                  element={
                    isLoggedIn ?
                      <TermsProvider>
                        <DashboardLayout onLogout={handleLogout}><AdminPanel /></DashboardLayout>
                      </TermsProvider> :
                      <Navigate to="/" replace />
                  }
                />
                <Route
                  path="/schedule-builder"
                  element={
                    isLoggedIn ?
                      <TermsProvider>
                        <DashboardLayout onLogout={handleLogout}><ScheduleBuilder /></DashboardLayout>
                      </TermsProvider> :
                      <Navigate to="/" replace />
                  }
                />
                <Route
                  path="/settings"
                  element={isLoggedIn ? <Settings /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/"
                  element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Home />}
                />
              </Routes>
            )}
          </TutorialProvider>
          </ScheduleProvider>
        </WatchedClassesProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
