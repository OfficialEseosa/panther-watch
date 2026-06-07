import { API_BASE_URL } from './apiConfig.js'

// PantherWatch-owned auth. Google sign-in runs through our backend
// (GET /api/auth/google/login → Google → /api/auth/google/callback), which redirects
// back to /auth/callback#token=<jwt>. We store that JWT and send it as a Bearer header.
// This replaces the old @supabase/supabase-js client; the public method names are kept
// so AuthContext, App.jsx, and watchedClassService don't need to change.

const TOKEN_KEY = 'pw_token'

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export class AuthService {
  constructor() {
    this.listeners = new Set()
    this.userInfoCache = null

    // Runs once on full page load — captures the token from the OAuth redirect.
    this.handleOAuthCallback()
  }

  getToken() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null

    const claims = decodeJwt(token)
    if (!claims || (claims.exp && claims.exp * 1000 <= Date.now())) {
      localStorage.removeItem(TOKEN_KEY)
      return null
    }
    return token
  }

  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token)
    this.userInfoCache = null
  }

  signInWithGoogle() {
    // Full-page redirect to the backend, which sends the browser on to Google.
    window.location.href = `${API_BASE_URL}/auth/google/login`
  }

  handleOAuthCallback() {
    if (typeof window === 'undefined' || window.location.pathname !== '/auth/callback') {
      return
    }
    const match = (window.location.hash || '').match(/token=([^&]+)/)
    if (match) {
      this.setToken(decodeURIComponent(match[1]))
      // Strip the token from the URL so it isn't left in history.
      window.history.replaceState(null, '', '/auth/callback')
      this.emit('SIGNED_IN')
    }
  }

  async getAccessToken() {
    return this.getToken()
  }

  async getSession() {
    const token = this.getToken()
    return token ? { access_token: token } : null
  }

  async getCurrentUser() {
    const token = this.getToken()
    return token ? decodeJwt(token) : null
  }

  async getUserInfo() {
    if (this.userInfoCache) return this.userInfoCache

    const claims = await this.getCurrentUser()
    if (!claims) return null

    this.userInfoCache = this.buildUserInfo(claims)
    return this.userInfoCache
  }

  buildUserInfo(claims) {
    if (!claims) return null

    let picture = claims.picture
    if (picture && picture.includes('googleusercontent.com')) {
      picture = picture.replace(/[?&]s=\d+/, '').replace(/=s\d+(-c)?/, '=s96-c')
    }

    const fullName = claims.name
    const firstName = fullName?.split(' ')[0] || claims.email?.split('@')[0] || 'User'

    return {
      provider: 'Google',
      name: fullName || claims.email,
      email: claims.email,
      picture,
      firstName
    }
  }

  isAuthenticated() {
    return this.getSession().then((session) => !!session)
  }

  async logout() {
    this.clearLocalData()
    this.emit('SIGNED_OUT')
  }

  clearCache() {
    this.userInfoCache = null
  }

  clearLocalData() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('authProvider')
    localStorage.removeItem('userData')
    localStorage.removeItem('googleUser')

    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('avatar_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))

    sessionStorage.clear()
    this.clearCache()
  }

  // Supabase-compatible shape so existing callers ({ data: { subscription } }) work.
  onAuthStateChange(callback) {
    this.listeners.add(callback)
    return {
      data: {
        subscription: {
          unsubscribe: () => this.listeners.delete(callback)
        }
      }
    }
  }

  emit(event) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, null)
      } catch (e) {
        console.error('Auth state listener error:', e)
      }
    })
  }
}

export const authService = new AuthService()
