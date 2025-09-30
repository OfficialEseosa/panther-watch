import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../config/authService.js'
import pantherLogo from '../../assets/panther.png'
import './Login.css'

function Login({ onLogin }) {
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await authService.getSession()
        if (session) {
          onLogin()
          navigate('/dashboard')
        }
      } catch (error) {
        console.error('Auth check error:', error.message)
      }
    }
    checkAuth()
  }, [onLogin, navigate])

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setErrorMessage('')
      
      await authService.signInWithGoogle()
      
      // The redirect will happen automatically, so we don't need to handle success here
      
    } catch (error) {
      console.error('Google login failed:', error.message)
      setErrorMessage(`Login failed: ${error.message}`)
      setLoading(false)
    }
  }

  return (
    <main className="login-container">
      <div className="login-card">
        <header className="login-header">
          <div className="login-title">
            <img src={pantherLogo} alt="PantherWatch" className="login-logo" />
            <h1>PantherWatch</h1>
          </div>
          <p>Georgia State University Course Search</p>
          <p className="login-subtitle">Sign in with your Google account to get started</p>
        </header>
        
        <div className="oauth-section">
          <button 
            type="button" 
            className="oauth-btn google-btn" 
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg className="oauth-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>
        </div>
        
        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}
        
        <footer className="login-footer">
          <p>Access real-time GSU course information and availability</p>
        </footer>
      </div>
    </main>
  )
}

export default Login
