'use client'
import { useEffect } from 'react'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import OfflineIndicator from '@/components/OfflineIndicator'

export function PWAComponents() {
  useEffect(() => {
    // Register service worker with proper error handling
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration)
        })
        .catch((error) => {
          // Only log error in development, fail silently in production
          if (process.env.NODE_ENV === 'development') {
            console.error('Service Worker registration failed:', error)
          }
        })
    }
  }, [])

  return (
    <>
      <PWAInstallPrompt />
      <OfflineIndicator />
    </>
  )
}
