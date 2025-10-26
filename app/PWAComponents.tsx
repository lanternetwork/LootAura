'use client'
import { useEffect } from 'react'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import OfflineIndicator from '@/components/OfflineIndicator'

export function PWAComponents() {
  useEffect(() => {
    // TEMPORARILY DISABLED: Register service worker
    // This is disabled to test OAuth callback detection
    console.log('🚨 Service Worker registration DISABLED for OAuth testing')
    
    // if ('serviceWorker' in navigator) {
    //   navigator.serviceWorker.register('/sw.js')
    //     .then((registration) => {
    //       console.log('Service Worker registered:', registration)
    //     })
    //     .catch((error) => {
    //       console.error('Service Worker registration failed:', error)
    //     })
    // }
  }, [])

  return (
    <>
      <PWAInstallPrompt />
      <OfflineIndicator />
    </>
  )
}
