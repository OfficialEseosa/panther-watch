import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CourseSearch from './pages/CourseSearch'
import CourseResultsPage from './pages/CourseResults'
import TrackedClasses from './pages/TrackedClasses'
import DashboardLayout from './layouts/DashboardLayout'
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
      
      {/* Protected routes with dashboard layout */}
      <Route 
        path="/dashboard" 
        element={
          isLoggedIn ? 
          <DashboardLayout><Dashboard /></DashboardLayout> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/course-search" 
        element={
          isLoggedIn ? 
          <DashboardLayout><CourseSearch /></DashboardLayout> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/course-results" 
        element={
          isLoggedIn ? 
          <DashboardLayout><CourseResultsPage /></DashboardLayout> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/tracked-classes" 
        element={
          isLoggedIn ? 
          <DashboardLayout><TrackedClasses /></DashboardLayout> : 
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
