// Geocoding utilities with caching to avoid repeated API calls

export interface GeocodeResult {
  lat: number
  lng: number
  formatted_address: string
  city?: string
  state?: string
  zip?: string
}

// In-memory cache with TTL and size limits
interface CacheEntry {
  result: GeocodeResult
  expires: number
}

const geocodeCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_CACHE_SIZE = 100

function evictCacheIfNeeded(): void {
  if (geocodeCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first in map)
    const firstKey = geocodeCache.keys().next().value
    if (firstKey) {
      geocodeCache.delete(firstKey)
    }
  }
}

function getCachedResult(key: string): GeocodeResult | null {
  const entry = geocodeCache.get(key)
  if (!entry) {
    return null
  }
  
  // Check expiration
  if (Date.now() > entry.expires) {
    geocodeCache.delete(key)
    return null
  }
  
  return entry.result
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (typeof window !== 'undefined') {
    // Lazy import to avoid SSR touching window
    import('./usageLogs').then(m => m.incGeocodeCall()).catch(() => {})
  }
  
  const cacheKey = address.toLowerCase()
  
  // Check cache first
  const cached = getCachedResult(cacheKey)
  if (cached) {
    return cached
  }

  try {
    // Use Nominatim for geocoding
    const result = await geocodeWithNominatim(address)
    if (result) {
      evictCacheIfNeeded()
      geocodeCache.set(cacheKey, {
        result,
        expires: Date.now() + CACHE_TTL_MS
      })
      return result
    }

    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}


async function geocodeWithNominatim(address: string): Promise<GeocodeResult | null> {
  const email = process.env.NOMINATIM_APP_EMAIL || 'admin@lootaura.com'
  
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&email=${email}&limit=1`,
    {
      headers: {
        'User-Agent': `LootAura/1.0 (${email})`
      }
    }
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

// Suggest addresses using Nominatim (for autocomplete)
export interface AddressSuggestion {
  id: string
  label: string
  lat: number
  lng: number
  address?: {
    houseNumber?: string
    road?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
  }
}

export async function fetchSuggestions(query: string, userLat?: number, userLng?: number): Promise<AddressSuggestion[]> {
  if (!query || query.length < 3) {
    return []
  }

  try {
    const params = new URLSearchParams({ q: query })
    if (Number.isFinite(userLat as number) && Number.isFinite(userLng as number)) {
      params.set('lat', String(userLat))
      params.set('lng', String(userLng))
    }
    const response = await fetch(`/api/geocoding/suggest?${params.toString()}`)
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    if (data.ok && Array.isArray(data.data)) {
      return data.data
    }
    
    return []
  } catch (error) {
    console.error('Suggest error:', error)
    return []
  }
}

// Reverse geocoding (coordinates → address)
export async function reverseGeocode(lat: number, lng: number): Promise<AddressSuggestion | null> {
  try {
    const response = await fetch(`/api/geocoding/reverse?lat=${lat}&lng=${lng}`)
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    if (data.ok && data.data) {
      return data.data
    }
    
    return null
  } catch (error) {
    console.error('Reverse geocode error:', error)
    return null
  }
}
