'use client'

import { useEffect, useState } from 'react'
import { ADSENSE_ENABLED } from '@/lib/env'

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

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient || !ADSENSE_ENABLED) return

    try {
      if (typeof window !== 'undefined' && window.adsbygoogle) {
        window.adsbygoogle = window.adsbygoogle || []
        window.adsbygoogle.push({})
      }
    } catch (error) {
      // Silently ignore errors to avoid crashing the page
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AdSense] Failed to push ad:', error)
      }
    }
  }, [isClient])

  if (!ADSENSE_ENABLED) {
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

