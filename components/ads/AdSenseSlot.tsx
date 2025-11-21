'use client'

import { useEffect, useRef } from 'react'

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
  const hasPushedRef = useRef(false)

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') {
      return
    }

    // Check if ads are enabled
    const adsEnabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'
    
    if (!adsEnabled) {
      return
    }

    // Wait for AdSense script to load
    const initAd = () => {
      if (hasPushedRef.current || !window.adsbygoogle) {
        return
      }

      // Check if ad element exists
      const adElement = document.querySelector(`ins[data-ad-slot="${slot}"]`) as HTMLElement
      if (!adElement) {
        return
      }

      // Check if already initialized
      if (adElement.hasAttribute('data-adsbygoogle-status')) {
        hasPushedRef.current = true
        return
      }

      // Push to adsbygoogle
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({})
        hasPushedRef.current = true
      } catch (error) {
        // Silently handle errors (e.g., ad blocker)
        console.warn('[AdSense] Failed to push ad:', error)
      }
    }

    // If script is already loaded, initialize immediately
    if (window.adsbygoogle) {
      initAd()
      return
    }

    // Wait for script to load
    let attempts = 0
    const maxAttempts = 30 // 3 seconds

    const checkAndInit = () => {
      attempts++
      
      if (window.adsbygoogle) {
        initAd()
      } else if (attempts < maxAttempts) {
        setTimeout(checkAndInit, 100)
      }
    }

    // Start checking after a short delay
    const timer = setTimeout(checkAndInit, 100)

    return () => {
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot])

  // Check if ads are enabled
  const adsEnabled = typeof window !== 'undefined' && 
    (process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1')

  if (!adsEnabled) {
    return null
  }

  return (
    <ins
      className={`adsbygoogle ${className}`}
      style={{ display: 'block', width: '100%', ...style }}
      data-ad-client="ca-pub-8685093412475036"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
      {...(id && { id })}
    />
  )
}
