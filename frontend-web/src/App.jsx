import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CourseSearch from './pages/CourseSearch'
import CourseResultsPage from './pages/CourseResults'
import TrackedClasses from './pages/TrackedClasses'
import DashboardLayout from './layouts/DashboardLayout'
import { TermsProvider } from './contexts/TermsContext'
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

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    )
  }

  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          isLoggedIn ? 
          <Navigate to="/dashboard" replace /> : 
          <Login onLogin={handleLogin} />
        } 
      />
      
      {/* Protected routes with dashboard layout and terms context */}
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
        path="/" 
        element={
          <Navigate to={isLoggedIn ? "/dashboard" : "/login"} replace />
        } 
      />
    </Routes>
  )
}

export default App
