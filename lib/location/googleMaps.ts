/**
 * Builds a universal maps URL using Apple Maps scheme for navigation/search.
 * 
 * Apple Maps URLs work cross-platform:
 * - iOS → Apple Maps
 * - Android/Desktop → typically redirects to Google Maps or platform default
 * 
 * Prefers lat/lng coordinates when available for precision,
 * otherwise falls back to address string.
 * 
 * @param options - Location data
 * @param options.lat - Latitude (optional)
 * @param options.lng - Longitude (optional)
 * @param options.address - Full address string (optional)
 * @returns Maps URL or empty string if no valid data
 */
export function buildGoogleMapsUrl(options: {
  lat?: number
  lng?: number
  address?: string
}): string {
  const { lat, lng, address } = options

  // Prefer lat/lng for precision when both are available
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return `https://maps.apple.com/?ll=${lat},${lng}`
  }

  // Fall back to address string if available
  if (address && typeof address === 'string' && address.trim()) {
    const encodedAddress = encodeURIComponent(address.trim())
    return `https://maps.apple.com/?q=${encodedAddress}`
  }

  // No valid data - return empty string (component will render plain text)
  return ''
}

/**
 * Convenience helper to build maps URL from a Sale object.
 * 
 * @param sale - Sale object with location data
 * @returns Maps URL or empty string
 */
export function buildGoogleMapsUrlFromSale(sale: {
  lat?: number | null
  lng?: number | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
}): string {
  // Try lat/lng first
  if (typeof sale.lat === 'number' && typeof sale.lng === 'number') {
    return buildGoogleMapsUrl({ lat: sale.lat, lng: sale.lng })
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

  return buildGoogleMapsUrl({ address: fullAddress || undefined })
}

