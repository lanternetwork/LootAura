'use client'
import { useEffect } from 'react'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import OfflineIndicator from '@/components/OfflineIndicator'

export function PWAComponents() {
  useEffect(() => {
    // Register service worker only if PWA is enabled
    if (process.env.NEXT_PUBLIC_ENABLE_PWA === "1" && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration)
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
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
