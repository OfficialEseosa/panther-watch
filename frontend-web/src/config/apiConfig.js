// API Configuration
const API_CONFIG = {
  development: {
    baseURL: 'http://localhost:8080/api'
  },
  production: {
    baseURL: 'https://api.pantherwatch.app/api'
  }
}

// Determine environment - Vite uses NODE_ENV, but we can also check for localhost
const isProduction = import.meta.env.PROD || window.location.hostname !== 'localhost'
const environment = isProduction ? 'production' : 'development'

export const API_BASE_URL = API_CONFIG[environment].baseURL

// Convenience function for building API URLs
export const buildApiUrl = (endpoint) => `${API_BASE_URL}${endpoint}`

// Export environment info for debugging
export const getCurrentEnvironment = () => ({
  environment,
  baseURL: API_BASE_URL,
  hostname: window.location.hostname,
  isProduction
})
