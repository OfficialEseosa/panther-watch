import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CourseSearch from './pages/CourseSearch'
import CourseResultsPage from './pages/CourseResults'
import DashboardLayout from './layouts/DashboardLayout'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const authProvider = sessionStorage.getItem('authProvider')
    if (authProvider) {
      setIsLoggedIn(true)
    }
  }, [])

  const handleLogin = () => {
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
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
          <DashboardLayout>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <h2>Tracked Classes</h2>
              <p>This feature is coming soon!</p>
            </div>
          </DashboardLayout> : 
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
