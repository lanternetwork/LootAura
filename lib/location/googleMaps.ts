/**
 * Builds a maps URL for navigation/search.
 * 
 * On mobile: uses Apple Maps universal links
 *   - iOS → Apple Maps
 *   - Android → redirects to Google Maps or platform default
 * 
 * On desktop: uses Google Maps web URLs
 * 
 * Prefers lat/lng coordinates when available for precision,
 * otherwise falls back to address string.
 * 
 * @param options - Location data
 * @param options.lat - Latitude (optional)
 * @param options.lng - Longitude (optional)
 * @param options.address - Full address string (optional)
 * @param options.isMobile - Whether the request is from a mobile device (default: false)
 * @returns Maps URL or empty string if no valid data
 */
export function buildGoogleMapsUrl(options: {
  lat?: number
  lng?: number
  address?: string
  isMobile?: boolean
}): string {
  const { lat, lng, address, isMobile = false } = options

  // Prefer lat/lng for precision when both are available
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    if (isMobile) {
      // Mobile: Apple Maps universal link
      return `https://maps.apple.com/?ll=${lat},${lng}`
    } else {
      // Desktop: Google Maps web URL
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    }
  }

  // Fall back to address string if available
  if (address && typeof address === 'string' && address.trim()) {
    const encodedAddress = encodeURIComponent(address.trim())
    if (isMobile) {
      // Mobile: Apple Maps universal link
      return `https://maps.apple.com/?q=${encodedAddress}`
    } else {
      // Desktop: Google Maps web URL
      return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`
    }
  }

  // No valid data - return empty string (component will render plain text)
  return ''
}

/**
 * Convenience helper to build maps URL from a Sale object.
 * 
 * @param sale - Sale object with location data
 * @param isMobile - Whether the request is from a mobile device (default: false)
 * @returns Maps URL or empty string
 */
export function buildGoogleMapsUrlFromSale(
  sale: {
    lat?: number | null
    lng?: number | null
    address?: string | null
    city?: string | null
    state?: string | null
    zip_code?: string | null
  },
  isMobile: boolean = false
): string {
  // Try lat/lng first
  if (typeof sale.lat === 'number' && typeof sale.lng === 'number') {
    return buildGoogleMapsUrl({ lat: sale.lat, lng: sale.lng, isMobile })
  }

  // Build address string from components
  const addressParts: string[] = []
  if (sale.address) addressParts.push(sale.address)
  if (sale.city && sale.state) {
    // Format as "City, State ZIP" (no comma before ZIP)
    const cityState = `${sale.city}, ${sale.state}`
    if (sale.zip_code) {
      addressParts.push(`${cityState} ${sale.zip_code}`)
    } else {
      addressParts.push(cityState)
    }
  } else if (sale.city) {
    addressParts.push(sale.city)
  }

  const fullAddress = addressParts.join(', ')

  return buildGoogleMapsUrl({ address: fullAddress || undefined, isMobile })
}

