import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import Login from './Login.jsx'
import CourseSearch from './CourseSearch.jsx'
import './App.css'

function App() {
  const { accounts } = useMsal()
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    if (accounts.length > 0) {
      setIsLoggedIn(true)
    }
  }, [accounts])

  const handleLogin = () => {
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
  }

  return (
    <>
      {isLoggedIn ? (
        <CourseSearch onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  )
}

export default App
