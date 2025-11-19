/**
 * Pure helper functions for building map URLs
 * SSR-safe, no browser globals
 */

/**
 * Build a Google Maps URL for desktop
 */
export function buildGoogleMapsUrl(options: {
  lat?: number
  lng?: number
  address?: string
}): string {
  const { lat, lng, address } = options

  // Prefer coordinates if available
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }

  // Fall back to address
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }

  return ''
}

/**
 * Build an Apple Maps navigation URL (universal link) for mobile
 * Uses daddr= parameter to open directly into turn-by-turn navigation
 */
export function buildAppleMapsUrl(options: {
  lat?: number
  lng?: number
  address?: string
}): string {
  const { lat, lng, address } = options

  // Prefer coordinates if available
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://maps.apple.com/?daddr=${lat},${lng}`
  }

  // Fall back to address
  if (address) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
  }

  return ''
}

