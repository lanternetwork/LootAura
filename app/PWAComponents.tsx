'use client'
import { PWAPlatformProvider } from '@/components/pwa/PWAPlatformProvider'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import OfflineIndicator from '@/components/OfflineIndicator'

export function PWAComponents() {
  return (
    <PWAPlatformProvider>
      <PWAInstallPrompt />
      <OfflineIndicator />
    </PWAPlatformProvider>
  )
}
