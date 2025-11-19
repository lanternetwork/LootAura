'use client'

import { buildGoogleMapsUrl, buildAppleMapsUrl } from '@/lib/location/mapsLinks'

interface AddressLinkProps {
  address?: string
  lat?: number
  lng?: number
  children?: React.ReactNode
  className?: string
}

/**
 * Hybrid address linking component:
 * - Desktop: opens Google Maps
 * - Mobile: opens Apple Maps navigation (universal link with daddr=)
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
  const googleUrl = buildGoogleMapsUrl({ lat, lng, address })
  const appleUrl = buildAppleMapsUrl({ lat, lng, address })

  // If no URLs can be built, render plain text
  if (!googleUrl && !appleUrl) {
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

  return (
    <>
      {/* Desktop: Google Maps link (hidden on mobile) */}
      <a
        href={googleUrl || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} hidden md:inline hover:underline cursor-pointer`}
        aria-label={ariaLabel}
      >
        {displayText}
      </a>
      
      {/* Mobile: Apple Maps link (hidden on desktop) */}
      <a
        href={appleUrl || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} inline md:hidden hover:underline cursor-pointer`}
        aria-label={ariaLabel}
      >
        {displayText}
      </a>
    </>
  )
}

