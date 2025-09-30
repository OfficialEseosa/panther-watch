import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CourseSearch from './pages/CourseSearch'
import CourseResultsPage from './pages/CourseResults'
import TrackedClasses from './pages/TrackedClasses'
import AdminPanel from './pages/Admin'
import DashboardLayout from './layouts/DashboardLayout'
import { TermsProvider } from './contexts/TermsContext'
import { AuthProvider } from './contexts/AuthContext'
import { WatchedClassesProvider } from './contexts/WatchedClassesContext'
import { ThemeProvider } from './contexts/ThemeContext'
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

    const { data: { subscription } } = authService.onAuthStateChange((event, session) => {
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
                path="/login"
                element={
                  isLoggedIn ?
                    <Navigate to="/dashboard" replace /> :
                    <Login onLogin={handleLogin} />
                }
              />

              <Route
                path="/dashboard"
                element={
                  isLoggedIn ?
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><Dashboard /></DashboardLayout>
                    </TermsProvider> :
                    <Navigate to="/login" replace />
                }
              />
              <Route
                path="/course-search"
                element={
                  isLoggedIn ?
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><CourseSearch /></DashboardLayout>
                    </TermsProvider> :
                    <Navigate to="/login" replace />
                }
              />
              <Route
                path="/course-results"
                element={
                  isLoggedIn ?
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><CourseResultsPage /></DashboardLayout>
                    </TermsProvider> :
                    <Navigate to="/login" replace />
                }
              />
              <Route
                path="/tracked-classes"
                element={
                  isLoggedIn ?
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><TrackedClasses /></DashboardLayout>
                    </TermsProvider> :
                    <Navigate to="/login" replace />
                }
              />
              <Route
                path="/admin"
                element={
                  isLoggedIn ?
                    <TermsProvider>
                      <DashboardLayout onLogout={handleLogout}><AdminPanel /></DashboardLayout>
                    </TermsProvider> :
                    <Navigate to="/login" replace />
                }
              />
              <Route
                path="/"
                element={
                  <Navigate to={isLoggedIn ? '/dashboard' : '/login'} replace />
                }
              />
            </Routes>
          )}
        </WatchedClassesProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
