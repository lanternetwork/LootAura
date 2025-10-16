// Geocoding utilities with caching to avoid repeated API calls

export interface GeocodeResult {
  lat: number
  lng: number
  formatted_address: string
  city?: string
  state?: string
  zip?: string
}

// Simple in-memory cache (in production, use Redis or database)
const geocodeCache = new Map<string, GeocodeResult>()

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (typeof window !== 'undefined') {
    // Lazy import to avoid SSR touching window
    import('./usageLogs').then(m => m.incGeocodeCall()).catch(() => {})
  }
  // Check cache first
  const cached = geocodeCache.get(address.toLowerCase())
  if (cached) {
    return cached
  }

  try {
    // Use Nominatim for geocoding
    const result = await geocodeWithNominatim(address)
    if (result) {
      geocodeCache.set(address.toLowerCase(), result)
      return result
    }

    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}


async function geocodeWithNominatim(address: string): Promise<GeocodeResult | null> {
  const email = process.env.NOMINATIM_APP_EMAIL || 'noreply@yardsalefinder.com'
  
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&email=${email}&limit=1`
  )
  
  const data = await response.json()
  
  if (data && data.length > 0) {
    const result = data[0]
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      formatted_address: result.display_name,
      city: result.address?.city || result.address?.town,
      state: result.address?.state,
      zip: result.address?.postcode
    }
  }

  return null
}

export function clearGeocodeCache() {
  geocodeCache.clear()
}
