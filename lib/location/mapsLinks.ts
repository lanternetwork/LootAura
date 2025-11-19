/**
 * Pure helper functions for building map URLs
 * SSR-safe, no browser globals
 */

/**
 * Build a Google Maps URL for desktop
 * For use on DESKTOP ONLY
 */
export function buildDesktopGoogleMapsUrl(options: {
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
 * Build an iOS navigation URL (Apple Maps app deep link)
 * For iOS MOBILE ONLY - uses maps:// to force native app
 */
export function buildIosNavUrl(options: {
  lat?: number
  lng?: number
  address?: string
}): string {
  const { lat, lng, address } = options

  // Prefer coordinates if available
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `maps://?daddr=${lat},${lng}`
  }

  // Fall back to address
  if (address) {
    return `maps://?daddr=${encodeURIComponent(address)}`
  }

  return ''
}

/**
 * Build an Android navigation URL (Google Maps directions)
 * For Android MOBILE ONLY - opens Google Maps app or default nav app
 */
export function buildAndroidNavUrl(options: {
  lat?: number
  lng?: number
  address?: string
}): string {
  const { lat, lng, address } = options

  // Prefer coordinates if available
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }

  // Fall back to address
  if (address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
  }

  return ''
}

/**
 * @deprecated Use buildDesktopGoogleMapsUrl instead
 * Kept for backward compatibility
 */
export function buildGoogleMapsUrl(options: {
  lat?: number
  lng?: number
  address?: string
}): string {
  return buildDesktopGoogleMapsUrl(options)
}

/**
 * @deprecated Use buildIosNavUrl instead
 * Kept for backward compatibility
 */
export function buildAppleMapsUrl(options: {
  lat?: number
  lng?: number
  address?: string
}): string {
  // Note: This was using https://maps.apple.com which opens the website
  // The new buildIosNavUrl uses maps:// which opens the native app
  const { lat, lng, address } = options

  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://maps.apple.com/?daddr=${lat},${lng}`
  }

  if (address) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
  }

  return ''
}

