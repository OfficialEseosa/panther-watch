import { useState, useEffect } from 'react'

function cleanupOldAvatarCache() {
  const keysToRemove = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('avatar_')) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key)
    } catch (e) {
      console.warn('Failed to remove old cache item:', e.message)
    }
  })
}

function CachedAvatar({ src, alt, fallbackText, className }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [cachedSrc, setCachedSrc] = useState(null)

  useEffect(() => {
    if (!src) {
      setImageError(true)
      return
    }

    const cacheKey = `avatar_${btoa(src).slice(0, 20)}`
    const cachedData = localStorage.getItem(cacheKey)
    
    if (cachedData) {
      const { dataUrl, timestamp } = JSON.parse(cachedData)
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        setCachedSrc(dataUrl)
        setImageLoaded(true)
        return
      } else {
        localStorage.removeItem(cacheKey)
      }
    }

    const loadAndCacheImage = async () => {
      try {
        const response = await fetch(src, { 
          mode: 'cors',
          cache: 'force-cache'
        })
        
        if (!response.ok) {
          throw new Error('Failed to fetch image')
        }

        const blob = await response.blob()

        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result
          setCachedSrc(dataUrl)
          setImageLoaded(true)

          try {
            cleanupOldAvatarCache()
            
            localStorage.setItem(cacheKey, JSON.stringify({
              dataUrl,
              timestamp: Date.now()
            }))
          } catch (e) {
            console.warn('Could not cache avatar image:', e.message)
          }
        }
        reader.onerror = () => setImageError(true)
        reader.readAsDataURL(blob)
        
      } catch (error) {
        console.warn('Failed to load avatar image:', error.message)
        setImageError(true)
      }
    }

    loadAndCacheImage()
  }, [src])

  if (imageLoaded && cachedSrc && !imageError) {
    return (
      <img 
        src={cachedSrc} 
        alt={alt}
        className={className}
      />
    )
  }

  return (
    <div className="avatar-placeholder">
      {fallbackText}
    </div>
  )
}

export default CachedAvatar
