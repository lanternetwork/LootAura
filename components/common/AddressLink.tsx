'use client'

import { useState, useEffect } from 'react'
import { buildDesktopGoogleMapsUrl, buildIosNavUrl, buildAndroidNavUrl } from '@/lib/location/mapsLinks'

interface AddressLinkProps {
  address?: string
  lat?: number
  lng?: number
  children?: React.ReactNode
  className?: string
}

type Platform = 'ios' | 'android' | 'desktop'

/**
 * Detect platform from user agent
 * SSR-safe - returns 'desktop' during SSR, detects on client
 * 
 * Very conservative detection - explicitly check for desktop OS first:
 * - Desktop: Mac, Windows, Linux, or any non-mobile device
 * - iOS: Only iPhone/iPod (excludes iPad which can be desktop-like)
 * - Android: Must have Android AND Mobile in user agent
 */
function detectPlatform(): Platform {
  if (typeof window === 'undefined') {
    return 'desktop'
  }

  const userAgent = navigator.userAgent || ''

  // Explicitly check for desktop operating systems first
  // This ensures desktop always gets Google Maps
  const isDesktopOS = /Macintosh|Windows|Linux|X11/.test(userAgent)
  
  // Check for iPhone or iPod (exclude iPad - treat as desktop)
  // Only match if it's NOT a desktop OS (extra safety check)
  if (!isDesktopOS && /iPhone|iPod/.test(userAgent)) {
    return 'ios'
  }

  // Check for Android mobile devices (must have both Android and Mobile)
  // Desktop Chrome on Android tablets doesn't have "Mobile" in user agent
  // Also exclude if it's a desktop OS
  if (!isDesktopOS && /Android/.test(userAgent) && /Mobile/.test(userAgent)) {
    return 'android'
  }

  // Default to desktop (including all desktop OS, iPad, tablets, etc.)
  // This is the safest default - desktop always gets Google Maps
  return 'desktop'
}

/**
 * Hybrid address linking component with platform detection:
 * - Desktop: opens Google Maps website
 * - iOS Mobile: opens native Apple Maps app (maps://)
 * - Android Mobile: opens Google Maps app with directions
 * 
 * Pure presentational component - no map state interaction
 */
export default function AddressLink({
  address,
  lat,
  lng,
  children,
  className = ''
}: AddressLinkProps) {
  const [platform, setPlatform] = useState<Platform>('desktop')
  const [isClient, setIsClient] = useState(false)

  // Detect platform on client side only
  useEffect(() => {
    setIsClient(true)
    setPlatform(detectPlatform())
  }, [])

  // Build URL based on platform
  // Always default to desktop during SSR and initial render
  // This ensures desktop gets Google Maps even before platform detection runs
  let href = ''
  if (!isClient || platform === 'desktop') {
    // During SSR or if platform is desktop -> use Google Maps
    href = buildDesktopGoogleMapsUrl({ lat, lng, address })
  } else if (platform === 'ios') {
    href = buildIosNavUrl({ lat, lng, address })
  } else if (platform === 'android') {
    href = buildAndroidNavUrl({ lat, lng, address })
  } else {
    // Fallback to desktop (Google Maps)
    href = buildDesktopGoogleMapsUrl({ lat, lng, address })
  }

  // If no URL can be built, render plain text
  if (!href) {
    return (
      <span className={className}>
        {children ?? address ?? ''}
      </span>
    )
  }

  // Build aria-label for accessibility
  const ariaLabel = address 
    ? `Start navigation to: ${address}`
    : 'Start navigation'

  const displayText = children ?? address ?? ''

  // Render a single link with platform-appropriate URL
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className || 'hover:underline'} cursor-pointer`}
      aria-label={ariaLabel}
    >
      {displayText}
    </a>
  )
}

