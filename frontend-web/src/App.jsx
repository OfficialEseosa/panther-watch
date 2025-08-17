import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import CourseSearch from './pages/CourseSearch'
import CourseResultsPage from './pages/CourseResults'
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
          <Navigate to="/course-search" replace /> : 
          <Login onLogin={handleLogin} />
        } 
      />
      <Route 
        path="/course-search" 
        element={
          isLoggedIn ? 
          <CourseSearch onLogout={handleLogout} /> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/course-results" 
        element={
          isLoggedIn ? 
          <CourseResultsPage onLogout={handleLogout} /> : 
          <Navigate to="/login" replace />
        } 
      />
      <Route 
        path="/" 
        element={
          <Navigate to={isLoggedIn ? "/course-search" : "/login"} replace />
        } 
      />
    </Routes>
  )
}

export default App
