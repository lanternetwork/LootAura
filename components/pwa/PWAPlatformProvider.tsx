'use client'

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PwaMetric =
  | 'sw_registered'
  | 'sw_update_available'
  | 'install_cta_shown'
  | 'install_cta_dismissed'
  | 'install_prompt_accepted'
  | 'install_prompt_dismissed'
  | 'app_installed'

interface PWAPlatformContextValue {
  isPwaEnabled: boolean
  isInstalled: boolean
  isStandalone: boolean
  isIOS: boolean
  isSafari: boolean
  isIOSSafari: boolean
  isAndroid: boolean
  isChromium: boolean
  canPromptInstall: boolean
  showAndroidInstallCta: boolean
  showIosInstallHelper: boolean
  dismissUntil: number | null
  hasUpdateAvailable: boolean
  promptInstall: () => Promise<void>
  dismissInstallUi: () => void
}

const DISMISSED_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED !== 'false'
const INSTALL_CTA_ENABLED = process.env.NEXT_PUBLIC_PWA_INSTALL_CTA_ENABLED !== 'false'
const IOS_HELPER_ENABLED = process.env.NEXT_PUBLIC_PWA_IOS_INSTALL_HELPER_ENABLED !== 'false'
const DESKTOP_INSTALL_ENABLED = process.env.NEXT_PUBLIC_PWA_DESKTOP_INSTALL_ENABLED === 'true'
const SW_ENABLED = process.env.NEXT_PUBLIC_PWA_SW_ENABLED !== 'false'

const PWAPlatformContext = createContext<PWAPlatformContextValue | null>(null)

function emitMetric(type: PwaMetric): void {
  try {
    // No PII in payload; this is intentionally coarse telemetry.
    window.dispatchEvent(new CustomEvent('pwa:metric', { detail: { type, ts: Date.now() } }))
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.info(`[PWA_METRIC] ${type}`)
    }
  } catch {
    // Best-effort metrics only.
  }
}

function getDismissUntil(): number | null {
  const raw = localStorage.getItem(DISMISSED_KEY)
  if (!raw) return null
  const ts = Number.parseInt(raw, 10)
  if (!Number.isFinite(ts)) return null
  const until = ts + DISMISS_DURATION_MS
  if (Date.now() >= until) {
    localStorage.removeItem(DISMISSED_KEY)
    return null
  }
  return until
}

function detectPlatform() {
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)
  const isChromium = /Chrome|CriOS|Edg|OPR|Brave/i.test(ua)
  return { isIOS, isAndroid, isSafari, isIOSSafari: isIOS && isSafari, isChromium }
}

export function PWAPlatformProvider({ children }: { children: React.ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissUntil, setDismissUntil] = useState<number | null>(null)
  const [hasUpdateAvailable, setHasUpdateAvailable] = useState(false)
  const [platform, setPlatform] = useState({
    isIOS: false,
    isAndroid: false,
    isSafari: false,
    isIOSSafari: false,
    isChromium: false,
  })

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const hasShownCtaRef = useRef(false)

  useEffect(() => {
    if (!PWA_ENABLED) return

    setPlatform(detectPlatform())

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    setIsStandalone(standalone)
    setIsInstalled(standalone)
    setDismissUntil(getDismissUntil())
  }, [])

  useEffect(() => {
    if (!PWA_ENABLED || !SW_ENABLED) return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        emitMetric('sw_registered')

        const markUpdate = () => {
          setHasUpdateAvailable(true)
          emitMetric('sw_update_available')
        }

        if (registration.waiting) {
          markUpdate()
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              markUpdate()
            }
          })
        })
      })
      .catch((error) => {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('Service Worker registration failed:', error)
        }
      })
  }, [])

  useEffect(() => {
    if (!PWA_ENABLED || !INSTALL_CTA_ENABLED) return

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as BeforeInstallPromptEvent
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsStandalone(true)
      deferredPromptRef.current = null
      localStorage.removeItem(DISMISSED_KEY)
      setDismissUntil(null)
      emitMetric('app_installed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const canPromptInstall = !!deferredPromptRef.current && !isInstalled && !isStandalone
  const isDismissed = dismissUntil !== null

  const showAndroidInstallCta =
    PWA_ENABLED &&
    INSTALL_CTA_ENABLED &&
    platform.isAndroid &&
    platform.isChromium &&
    canPromptInstall &&
    !isDismissed &&
    (DESKTOP_INSTALL_ENABLED || !platform.isIOS)

  const showIosInstallHelper =
    PWA_ENABLED &&
    INSTALL_CTA_ENABLED &&
    IOS_HELPER_ENABLED &&
    platform.isIOSSafari &&
    !isInstalled &&
    !isStandalone &&
    !isDismissed

  useEffect(() => {
    const showing = showAndroidInstallCta || showIosInstallHelper
    if (showing && !hasShownCtaRef.current) {
      emitMetric('install_cta_shown')
      hasShownCtaRef.current = true
    }
    if (!showing) {
      hasShownCtaRef.current = false
    }
  }, [showAndroidInstallCta, showIosInstallHelper])

  const dismissInstallUi = () => {
    const now = Date.now()
    localStorage.setItem(DISMISSED_KEY, now.toString())
    setDismissUntil(now + DISMISS_DURATION_MS)
    emitMetric('install_cta_dismissed')
  }

  const promptInstall = async () => {
    const promptEvent = deferredPromptRef.current
    if (!promptEvent) return

    try {
      await promptEvent.prompt()
      const { outcome } = await promptEvent.userChoice
      if (outcome === 'accepted') {
        emitMetric('install_prompt_accepted')
      } else {
        emitMetric('install_prompt_dismissed')
        dismissInstallUi()
      }
    } catch (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('[PWA] Error showing install prompt:', error)
      }
    } finally {
      deferredPromptRef.current = null
    }
  }

  const value = useMemo<PWAPlatformContextValue>(
    () => ({
      isPwaEnabled: PWA_ENABLED,
      isInstalled,
      isStandalone,
      isIOS: platform.isIOS,
      isSafari: platform.isSafari,
      isIOSSafari: platform.isIOSSafari,
      isAndroid: platform.isAndroid,
      isChromium: platform.isChromium,
      canPromptInstall,
      showAndroidInstallCta,
      showIosInstallHelper,
      dismissUntil,
      hasUpdateAvailable,
      promptInstall,
      dismissInstallUi,
    }),
    [
      isInstalled,
      isStandalone,
      platform.isIOS,
      platform.isSafari,
      platform.isIOSSafari,
      platform.isAndroid,
      platform.isChromium,
      canPromptInstall,
      showAndroidInstallCta,
      showIosInstallHelper,
      dismissUntil,
      hasUpdateAvailable,
    ]
  )

  return <PWAPlatformContext.Provider value={value}>{children}</PWAPlatformContext.Provider>
}

export function usePWAPlatform(): PWAPlatformContextValue {
  const ctx = useContext(PWAPlatformContext)
  if (!ctx) {
    throw new Error('usePWAPlatform must be used within PWAPlatformProvider')
  }
  return ctx
}
