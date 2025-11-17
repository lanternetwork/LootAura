'use client'

import { buildGoogleMapsUrl } from '@/lib/location/googleMaps'

interface AddressLinkProps {
  /** Street address */
  address?: string | null
  /** Latitude */
  lat?: number | null
  /** Longitude */
  lng?: number | null
  /** City */
  city?: string | null
  /** State */
  state?: string | null
  /** ZIP code */
  zipCode?: string | null
  /** Custom children to render (if not provided, uses address) */
  children?: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

/**
 * Renders an address as a clickable link to Google Maps.
 * Falls back to plain text if no valid location data is available.
 * 
 * Prefers lat/lng coordinates when available for precision.
 * Uses address string as fallback.
 */
export default function AddressLink({
  address,
  lat,
  lng,
  city,
  state,
  zipCode,
  children,
  className = ''
}: AddressLinkProps) {
  // Build full address string for display/aria-label
  // If address is provided, use it as primary; otherwise build from components
  let fullAddress = ''
  if (address) {
    // If we have a street address, combine it with city/state/zip
    const parts: string[] = [address]
    if (city && state) {
      parts.push(`${city}, ${state}`)
      if (zipCode) parts.push(zipCode)
    } else if (city) {
      parts.push(city)
    }
    fullAddress = parts.join(', ')
  } else if (city && state) {
    // No street address, just city/state/zip
    fullAddress = `${city}, ${state}`
    if (zipCode) fullAddress += ` ${zipCode}`
  } else if (city) {
    fullAddress = city
  } else if (state) {
    fullAddress = state
  }

  // Build Google Maps URL
  const mapsUrl = buildGoogleMapsUrl({
    lat: typeof lat === 'number' ? lat : undefined,
    lng: typeof lng === 'number' ? lng : undefined,
    address: fullAddress || undefined
  })

  // If we have a valid URL, render as link
  if (mapsUrl) {
    const displayText = children || fullAddress || 'View on map'
    const ariaLabel = fullAddress 
      ? `Open in Google Maps: ${fullAddress}`
      : 'Open in Google Maps'

    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={`${className} hover:underline`}
      >
        {displayText}
      </a>
    )
  }

  // No valid location data - render plain text
  return (
    <span className={className}>
      {children || fullAddress || ''}
    </span>
  )
}

