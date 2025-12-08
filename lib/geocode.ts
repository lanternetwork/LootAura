// Geocoding utilities with caching to avoid repeated API calls

export interface GeocodeResult {
  lat: number
  lng: number
  formatted_address: string
  city?: string
  state?: string
  zip?: string
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (typeof window !== 'undefined') {
    // Lazy import to avoid SSR touching window
    import('./usageLogs').then(m => m.incGeocodeCall()).catch(() => {})
  }
  
  if (!address || address.trim().length < 5) {
    return null
  }
  
  const trimmedAddress = address.trim()
  const cacheKey = trimmedAddress.toLowerCase()
  
  // Check Redis-backed cache first
  try {
    const { getGeocodeCache } = await import('./geocode/redisCache')
    const cached = await getGeocodeCache(cacheKey)
    if (cached) {
      return cached as GeocodeResult
    }
  } catch (cacheError) {
    // Ignore cache errors - continue with API call
  }

  try {
    // Call server-side API endpoint instead of directly accessing server env vars
    const response = await fetch(`/api/geocoding/address?address=${encodeURIComponent(trimmedAddress)}`)
    
    if (!response.ok) {
      if (response.status === 404) {
        // Address not found - not an error, just return null
        return null
      }
      // Log other errors but don't throw
      console.error('Geocoding API error:', response.status, response.statusText)
      return null
    }
    
    const data = await response.json()
    if (data.ok && data.data) {
      // Store in Redis-backed cache (24 hour TTL)
      try {
        const { setGeocodeCache } = await import('./geocode/redisCache')
        await setGeocodeCache(cacheKey, data.data, 86400).catch(() => {
          // Ignore cache write errors - geocoding succeeded
        })
      } catch (cacheError) {
        // Ignore cache errors
      }
      return data.data as GeocodeResult
    }

    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

export async function clearGeocodeCache() {
  const { clearGeocodeCache: clearRedisCache } = await import('./geocode/redisCache')
  await clearRedisCache()
}

// Suggest addresses using Nominatim (for autocomplete)
export interface AddressSuggestion {
  id: string
  label: string
  lat: number
  lng: number
  address?: {
    line1?: string // Combined houseNumber + road
    houseNumber?: string
    road?: string
    city?: string
    state?: string
    zip?: string // Alias for postcode
    postcode?: string
    country?: string
  }
}

export async function fetchSuggestions(query: string, userLat?: number, userLng?: number, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  if (!query || query.length < 2) {
    return []
  }

  try {
    const params = new URLSearchParams({ q: query })
    if (Number.isFinite(userLat as number) && Number.isFinite(userLng as number)) {
      params.set('lat', String(userLat))
      params.set('lng', String(userLng))
    }
    const response = await fetch(`/api/geocoding/suggest?${params.toString()}`, { signal })
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    if (data.ok && Array.isArray(data.data)) {
      return data.data
    }
    
    return []
  } catch (error: any) {
    // AbortError is expected when requests are cancelled - don't log it
    if (error?.name === 'AbortError') {
      return []
    }
    console.error('Suggest error:', error)
    return []
  }
}

// API response type
export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
  code?: string
  _debug?: any
}

// Fetch addresses from Overpass API for numeric prefix searches
export async function fetchOverpassAddresses(
  q: string, // Full query string (numeric-only or digits+street)
  lat: number,
  lng: number,
  limit: number = 8,
  signal?: AbortSignal
): Promise<ApiResponse<AddressSuggestion[]>> {
  // Validate coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      error: 'Latitude and longitude are required',
      code: 'NO_COORDS'
    }
  }

  try {
    const params = new URLSearchParams({
      q: q.trim(),
      lat: String(lat),
      lng: String(lng),
      limit: String(Math.min(Math.max(limit, 1), 10))
    })
    
    const response = await fetch(`/api/geocoding/overpass-address?${params.toString()}`, { signal })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        ok: false,
        error: errorData.error || 'Overpass request failed',
        code: errorData.code || 'OVERPASS_UNAVAILABLE'
      }
    }
    
            const data = await response.json()
            if (data.ok && Array.isArray(data.data)) {
              // Include debug info if present and in development
              const result: ApiResponse<AddressSuggestion[]> = {
                ok: true,
                data: data.data,
              }
              // Only preserve _debug in non-production environments
              if (process.env.NODE_ENV !== 'production' && data._debug) {
                result._debug = data._debug
              }
              return result
            }
            
            return {
              ok: false,
              error: 'Invalid response from Overpass',
              code: 'OVERPASS_UNAVAILABLE'
            }
  } catch (error: any) {
    // AbortError is expected when requests are cancelled - don't log it
    if (error?.name === 'AbortError') {
      return {
        ok: false,
        error: 'Request cancelled',
        code: 'ABORTED'
      }
    }
    console.error('Overpass error:', error)
    return {
      ok: false,
      error: 'Overpass request failed',
      code: 'OVERPASS_UNAVAILABLE'
    }
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
