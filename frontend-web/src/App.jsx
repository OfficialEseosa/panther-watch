import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import CourseSearch from './pages/CourseSearch'
import CourseResultsPage from './pages/CourseResults'
import TrackedClasses from './pages/TrackedClasses'
import AdminPanel from './pages/Admin'
import Settings from './pages/Settings'
import ScheduleBuilder from './pages/ScheduleBuilder'
import DashboardLayout from './layouts/DashboardLayout'
import { TermsProvider } from './contexts/TermsContext.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { WatchedClassesProvider } from './contexts/WatchedClassesContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { TutorialProvider } from './contexts/TutorialContext.jsx'
import { authService } from './config/authService.js'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

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

  const handleLogin = () => {
    setIsLoggedIn(true)
  }

  const handleLogout = async () => {
    await authService.logout()
    setIsLoggedIn(false)
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <WatchedClassesProvider>
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
                <Route
                  path="/dashboard"
                  element={
                    isLoggedIn ?
                      <TermsProvider>
                        <DashboardLayout onLogout={handleLogout}><Dashboard /></DashboardLayout>
                      </TermsProvider> :
                      <Navigate to="/" replace />
                  }
                />
                <Route
                  path="/course-search"
                  element={
                    isLoggedIn ?
                      <TermsProvider>
                        <DashboardLayout onLogout={handleLogout}><CourseSearch /></DashboardLayout>
                      </TermsProvider> :
                      <Navigate to="/" replace />
                  }
                />
                <Route
                  path="/course-results"
                  element={
                    isLoggedIn ?
                      <TermsProvider>
                        <DashboardLayout onLogout={handleLogout}><CourseResultsPage /></DashboardLayout>
                      </TermsProvider> :
                      <Navigate to="/" replace />
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
        </WatchedClassesProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
