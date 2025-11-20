'use client'

import { useEffect, useState } from 'react'

interface AdSenseSlotProps {
  slot: string
  className?: string
  format?: string
  fullWidthResponsive?: boolean
  style?: React.CSSProperties
  id?: string
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>
  }
}

export default function AdSenseSlot({
  slot,
  className = '',
  format = 'auto',
  fullWidthResponsive = true,
  style,
  id,
}: AdSenseSlotProps) {
  const [isClient, setIsClient] = useState(false)
  const [adsEnabled, setAdsEnabled] = useState(false)

  useEffect(() => {
    setIsClient(true)
    // Check environment variable on client side
    const enabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'
    setAdsEnabled(enabled)
    
    // Debug logging in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AdSense] Environment check:', {
        envValue: process.env.NEXT_PUBLIC_ENABLE_ADSENSE,
        enabled,
        slot,
      })
    }
  }, [slot])

  useEffect(() => {
    if (!isClient || !adsEnabled) return

    // Wait for AdSense script to load
    const initAd = () => {
      try {
        if (typeof window !== 'undefined') {
          window.adsbygoogle = window.adsbygoogle || []
          window.adsbygoogle.push({})
        }
      } catch (error) {
        // Silently ignore errors to avoid crashing the page
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AdSense] Failed to push ad:', error)
        }
      }
    }

    // If adsbygoogle is already available, push immediately
    if (typeof window !== 'undefined' && window.adsbygoogle) {
      initAd()
    } else {
      // Otherwise, wait a bit for the script to load
      const timer = setTimeout(() => {
        initAd()
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [isClient, adsEnabled])

  if (!adsEnabled) {
    return null
  }

  if (!isClient) {
    // Return a placeholder to avoid hydration issues
    return (
      <div
        className={className}
        style={{ minHeight: '100px', ...style }}
        suppressHydrationWarning
      />
    )
  }

  return (
    <div className={className} style={{ minHeight: '100px', ...style }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', ...style }}
        data-ad-client="ca-pub-8685093412475036"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
        {...(id && { id })}
        suppressHydrationWarning
      />
    </div>
  )
}

