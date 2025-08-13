import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { loginRequest } from './authConfig.js'
import { initializeGoogleAuth, signInWithGoogle } from './googleAuthConfig.js'
import './Login.css'

function Login({ onLogin }) {
  const { instance } = useMsal()
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  })
  const [isGoogleReady, setIsGoogleReady] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showGsuEmailModal, setShowGsuEmailModal] = useState(false)
  const [gsuEmailInput, setGsuEmailInput] = useState('')
  const [gsuEmailError, setGsuEmailError] = useState('')
  const [pendingGoogleUser, setPendingGoogleUser] = useState(null)

  // Initialize Google Auth when component mounts
  useEffect(() => {
    const setupGoogle = async () => {
      try {
        await initializeGoogleAuth()
        setIsGoogleReady(true)
        console.log('Google Auth initialized')
      } catch (error) {
        console.error('Failed to initialize Google Auth:', error)
      }
    }
    setupGoogle()
  }, [])

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrorMessage('')
    console.log('Login attempt:', credentials)
    // For now, just redirect to main form
    onLogin()
  }

  const handleMicrosoftLogin = async () => {
    try {
      setErrorMessage('')
      console.log('Starting Microsoft login...')
      const response = await instance.loginPopup(loginRequest)
      console.log('Microsoft login successful:', response)
      
      // Extract user info
      const { account } = response
      const userEmail = account.username
      
      // Validate GSU email domain
      if (!userEmail.endsWith('@student.gsu.edu') && !userEmail.endsWith('@gsu.edu')) {
        console.error('Invalid email domain. Please use your GSU email address.')
        setErrorMessage('Please sign in with your GSU email address (@student.gsu.edu or @gsu.edu)')
        
        // Log out the user since they don't have the right email domain
        await instance.logoutPopup()
        return
      }
      
      console.log('Valid GSU user:', {
        name: account.name,
        email: userEmail,
        id: account.homeAccountId
      })
      
      // Proceed to main app
      onLogin()
    } catch (error) {
      console.error('Microsoft login failed:', error)
      setErrorMessage('Microsoft login failed. Please try again.')
    }
  }

  const handleGoogleLogin = async () => {
    try {
      setErrorMessage('')
      console.log('Starting Google login...')
      
      if (!isGoogleReady) {
        console.error('Google Auth not ready')
        setErrorMessage('Google authentication is not ready. Please try again.')
        return
      }

      const response = await signInWithGoogle()
      console.log('Google login successful:', response)
      
      // Store the user info and show GSU email modal
      setPendingGoogleUser(response.user)
      setShowGsuEmailModal(true)
      setGsuEmailInput('')
      setGsuEmailError('')
      
    } catch (error) {
      console.error('Google login failed:', error)
      setErrorMessage('Google login failed. Please try again.')
    }
  }

  const handleGsuEmailSubmit = () => {
    if (!gsuEmailInput) {
      setGsuEmailError('Please enter your GSU email address')
      return
    }
    
    // Validate GSU email format
    if (!gsuEmailInput.endsWith('@student.gsu.edu') && !gsuEmailInput.endsWith('@gsu.edu')) {
      setGsuEmailError('Please enter a valid GSU email address (@student.gsu.edu or @gsu.edu)')
      return
    }
    
    console.log('Google user with GSU email:', {
      googleName: pendingGoogleUser.name,
      googleEmail: pendingGoogleUser.email,
      gsuEmail: gsuEmailInput,
      picture: pendingGoogleUser.picture
    })
    
    // Store both the Google account info and GSU email for the session
    sessionStorage.setItem('authProvider', 'google')
    sessionStorage.setItem('googleUser', JSON.stringify(pendingGoogleUser))
    sessionStorage.setItem('gsuEmail', gsuEmailInput)
    
    // Close modal and proceed to main app
    setShowGsuEmailModal(false)
    setPendingGoogleUser(null)
    onLogin()
  }

  const handleModalClose = () => {
    setShowGsuEmailModal(false)
    setPendingGoogleUser(null)
    setGsuEmailInput('')
    setGsuEmailError('')
  }

  return (
    <main className="login-container">
      <div className="login-card">
        <header className="login-header">
          <h1>PantherWatch</h1>
          <p>Sign in to search GSU courses</p>
        </header>
        
        {/* OAuth Login Buttons */}
        <div className="oauth-section">
          <button type="button" className="oauth-btn google-btn" onClick={handleGoogleLogin}>
            <svg className="oauth-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google (Personal Email)
          </button>
          
          <button type="button" className="oauth-btn microsoft-btn" onClick={handleMicrosoftLogin}>
            <svg className="oauth-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
            </svg>
            Sign in with Microsoft (Student Email) - WIP
          </button>
        </div>
        
        {/* Error Message Display */}
        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}
        
        {/* Divider */}
        <div className="login-divider">
          <span>or</span>
        </div>
        
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={credentials.email}
              onChange={handleChange}
              placeholder="your.email@student.gsu.edu"
              required
            />
          </div>
          
          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={credentials.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button type="submit" className="login-btn">
            Login
          </button>
        </form>
        
        <footer className="login-footer">
          <p>Access GSU course information and availability</p>
        </footer>
      </div>

      {/* GSU Email Modal */}
      {showGsuEmailModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Enter Your GSU Email</h3>
            <p>You signed in with your personal Google account. Please provide your GSU email address to access course information.</p>
            
            <div className="modal-form">
              <input
                type="email"
                value={gsuEmailInput}
                onChange={(e) => setGsuEmailInput(e.target.value)}
                placeholder="your.email@student.gsu.edu"
                className="gsu-email-input"
              />
              
              {gsuEmailError && (
                <div className="modal-error">
                  {gsuEmailError}
                </div>
              )}
              
              <div className="modal-buttons">
                <button onClick={handleGsuEmailSubmit} className="modal-submit-btn">
                  Continue
                </button>
                <button onClick={handleModalClose} className="modal-cancel-btn">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default Login
