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

  useEffect(() => {
    setIsLoggedIn(authService.isAuthenticated())
  }, [])

  const handleLogin = () => {
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    authService.logout()
    setIsLoggedIn(false)
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
            <DashboardLayout><Dashboard /></DashboardLayout>
          </TermsProvider> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/course-search" 
        element={
          isLoggedIn ? 
          <TermsProvider>
            <DashboardLayout><CourseSearch /></DashboardLayout>
          </TermsProvider> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/course-results" 
        element={
          isLoggedIn ? 
          <TermsProvider>
            <DashboardLayout><CourseResultsPage /></DashboardLayout>
          </TermsProvider> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/tracked-classes" 
        element={
          isLoggedIn ? 
          <TermsProvider>
            <DashboardLayout><TrackedClasses /></DashboardLayout>
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
