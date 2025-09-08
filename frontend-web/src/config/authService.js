import { supabase } from './supabase.js'

export class AuthService {
  constructor() {
    this.userInfoCache = null
    this.userCache = null
    this.sessionCache = null
    this.cacheTimestamp = null
    this.CACHE_DURATION = 60 * 60 * 1000

    this.handleOAuthCallback()
    
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        console.log('User signed in successfully')
        this.clearCache()
      } else if (event === 'SIGNED_OUT') {
        console.log('User signed out')
        this.clearLocalData()
        this.clearCache()
      }
    })
  }

  async handleOAuthCallback() {
    // Check if we're in an OAuth callback
    if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error('OAuth callback error:', error.message)
        }
      } catch (error) {
        console.error('OAuth callback processing error:', error.message)
      }
    }
  }

  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Google sign in error:', error)
      throw error
    }
  }

  clearCache() {
    this.userInfoCache = null
    this.userCache = null
    this.sessionCache = null
    this.cacheTimestamp = null
  }

  isCacheValid() {
    return this.cacheTimestamp && (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION
  }

  async getCurrentUser() {
    try {
      if (this.userCache && this.isCacheValid()) {
        return this.userCache
      }

      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error

      this.userCache = user
      this.cacheTimestamp = Date.now()
      
      return user
    } catch (error) {
      console.error('Get user error:', error)
      return null
    }
  }

  async getSession() {
    try {
      if (this.sessionCache && this.isCacheValid()) {
        return this.sessionCache
      }

      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error

      this.sessionCache = session
      this.cacheTimestamp = Date.now()
      
      return session
    } catch (error) {
      console.error('Get session error:', error.message)
      return null
    }
  }

  async logout() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      this.clearLocalData()
    }
  }

  clearLocalData() {
    localStorage.removeItem('authProvider')
    localStorage.removeItem('userData')
    localStorage.removeItem('googleUser')
    sessionStorage.clear()
    this.clearCache()
  }

  isAuthenticated() {
    return this.getSession().then(session => !!session)
  }

  async getUserInfo() {
    if (this.userInfoCache && this.isCacheValid()) {
      return this.userInfoCache
    }

    const user = await this.getCurrentUser()
    if (!user) return null

    let picture = user.user_metadata?.avatar_url || user.user_metadata?.picture

    if (picture && picture.includes('googleusercontent.com')) {
      picture = picture.replace(/[?&]s=\d+/, '').replace(/=s\d+(-c)?/, '=s96-c')
    }
    
    const userInfo = {
      provider: 'Google',
      name: user.user_metadata?.full_name || user.email,
      email: user.email,
      picture: picture,
      firstName: user.user_metadata?.full_name?.split(' ')[0] || user.user_metadata?.name?.split(' ')[0] || 'User'
    }

    this.userInfoCache = userInfo
    this.cacheTimestamp = Date.now()
    
    return userInfo
  }

  async getAccessToken() {
    const session = await this.getSession()
    return session?.access_token || null
  }

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

export const authService = new AuthService()
