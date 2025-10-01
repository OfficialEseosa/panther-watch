import { useState, useEffect } from 'react'
import { AuthContext } from './AuthContext.js'
import { authService } from '../config/authService.js'

export function AuthProvider({ children }) {
  const [userInfo, setUserInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        setLoading(true)
        setError(null)
        const info = await authService.getUserInfo()
        setUserInfo(info)
      } catch (err) {
        console.error('Failed to load user info:', err)
        setError(err)
      } finally {
        setLoading(false)
      }
    }

    loadUserInfo()

    const { data: { subscription } } = authService.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        loadUserInfo()
      } else if (event === 'SIGNED_OUT') {
        setUserInfo(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const refreshUserInfo = async () => {
    try {
      setError(null)
      // Clear cache to force fresh data
      authService.clearCache()
      const info = await authService.getUserInfo()
      setUserInfo(info)
    } catch (err) {
      console.error('Failed to refresh user info:', err)
      setError(err)
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
      setUserInfo(null)
    } catch (err) {
      console.error('Failed to logout:', err)
    }
  }

  const value = {
    userInfo,
    loading,
    error,
    refreshUserInfo,
    logout,
    isAuthenticated: !!userInfo
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
