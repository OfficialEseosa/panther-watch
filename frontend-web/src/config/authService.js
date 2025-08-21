import { API_BASE_URL } from './apiConfig.js'

export class AuthService {
  constructor() {
    this.baseUrl = `${API_BASE_URL}/auth`
  }

  async authenticateUser(authData) {
    try {
      const response = await fetch(`${this.baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authData)
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Authentication failed')
      }

      localStorage.setItem('authProvider', 'google')
      localStorage.setItem('userData', JSON.stringify(result.user))
      
      return result
    } catch (error) {
      console.error('Authentication error:', error)
      throw error
    }
  }

  async getCurrentUser(googleId) {
    try {
      const response = await fetch(`${this.baseUrl}/me?googleId=${encodeURIComponent(googleId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to get user data')
      }

      return result.user
    } catch (error) {
      console.error('Get user error:', error)
      throw error
    }
  }

  getStoredUserData() {
    try {
      const userData = localStorage.getItem('userData')
      return userData ? JSON.parse(userData) : null
    } catch (error) {
      console.error('Error parsing stored user data:', error)
      return null
    }
  }

  isAuthenticated() {
    const authProvider = localStorage.getItem('authProvider')
    const userData = this.getStoredUserData()
    return authProvider && userData && userData.googleId
  }

  logout() {
    localStorage.removeItem('authProvider')
    localStorage.removeItem('userData')
    localStorage.removeItem('googleUser')
    sessionStorage.clear()
  }

  getGoogleId() {
    const userData = this.getStoredUserData()
    return userData ? userData.googleId : null
  }

  getUserInfo() {
    const userData = this.getStoredUserData()
    if (!userData) return null

    return {
      provider: 'Google',
      name: userData.name,
      email: userData.email,
      picture: userData.picture,
      firstName: userData.name?.split(' ')[0] || 'User',
      googleId: userData.googleId
    }
  }
}

export const authService = new AuthService()
