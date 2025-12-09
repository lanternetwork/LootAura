import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Simple per-process cache for address geocoding (24 hour TTL)
const addressCache = new Map<string, { data: any; expires: number }>()

// Nominatim rate limiting (1 request per second)
let lastNominatimCall = 0
const NOMINATIM_DELAY = 1000 // 1 second

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getCachedAddress(address: string): any | null {
  const cacheKey = address.toLowerCase().trim()
  const cached = addressCache.get(cacheKey)
  if (cached && Date.now() < cached.expires) {
    return cached.data
  }
  if (cached) {
    addressCache.delete(cacheKey) // Clean up expired entry
  }
  return null
}

function setCachedAddress(address: string, data: any): void {
  const cacheKey = address.toLowerCase().trim()
  addressCache.set(cacheKey, {
    data,
    expires: Date.now() + 86400000 // 24 hours
  })
}

async function geocodeWithNominatim(address: string): Promise<any> {
  const { retry, isTransientError } = await import('@/lib/utils/retry')
  const { getNominatimEmail } = await import('@/lib/env')
  
  return await retry(
    async () => {
      // Rate limiting: ensure at least 1 second between calls
      const now = Date.now()
      const timeSinceLastCall = now - lastNominatimCall
      if (timeSinceLastCall < NOMINATIM_DELAY) {
        await delay(NOMINATIM_DELAY - timeSinceLastCall)
      }
      lastNominatimCall = Date.now()

      const email = getNominatimEmail()
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&email=${email}&limit=1`
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': `LootAura/1.0 (contact: ${email})`
        }
      })
      
      if (!response.ok) {
        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Nominatim request failed: ${response.status}`)
        }
        // Retry on 5xx and network errors
        throw new Error(`Nominatim request failed: ${response.status}`)
      }
      
      return await response.json()
    },
    {
      maxAttempts: 3,
      initialDelayMs: 500,
      retryable: isTransientError,
    }
  )
}

async function addressHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    
    if (!address || address.trim().length < 5) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Address must be at least 5 characters' 
      }, { status: 400 })
    }
    
    const trimmedAddress = address.trim()
    
    // Check cache first
    const cachedResult = getCachedAddress(trimmedAddress)
    if (cachedResult) {
      return NextResponse.json({
        ok: true,
        data: cachedResult
      }, {
        headers: {
          'Cache-Control': 'public, max-age=86400' // 24 hours
        }
      })
    }
    
    // Check Redis-backed cache
    try {
      const { getGeocodeCache } = await import('@/lib/geocode/redisCache')
      const redisCached = await getGeocodeCache(trimmedAddress.toLowerCase())
      if (redisCached) {
        // Also store in per-process cache
        setCachedAddress(trimmedAddress, redisCached)
        return NextResponse.json({
          ok: true,
          data: redisCached
        }, {
          headers: {
            'Cache-Control': 'public, max-age=86400' // 24 hours
          }
        })
      }
    } catch (cacheError) {
      // Ignore cache errors - continue with Nominatim lookup
    }
    
    // Geocode with Nominatim
    const data = await geocodeWithNominatim(trimmedAddress)
    
    if (data && data.length > 0) {
      const result = data[0]
      const geocodeResult = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        formatted_address: result.display_name,
        city: result.address?.city || result.address?.town,
        state: result.address?.state,
        zip: result.address?.postcode
      }
      
      // Store in both caches
      setCachedAddress(trimmedAddress, geocodeResult)
      try {
        const { setGeocodeCache } = await import('@/lib/geocode/redisCache')
        await setGeocodeCache(trimmedAddress.toLowerCase(), geocodeResult, 86400).catch(() => {
          // Ignore cache write errors - geocoding succeeded
        })
      } catch (cacheError) {
        // Ignore cache errors
      }
      
      return NextResponse.json({
        ok: true,
        data: geocodeResult
      }, {
        headers: {
          'Cache-Control': 'public, max-age=86400' // 24 hours
        }
      })
    }
    
    return NextResponse.json({
      ok: false,
      error: 'Address not found'
    }, { status: 404 })
  } catch (error) {
    console.error('[GEOCODE_ADDRESS] Error:', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Geocoding failed'
    }, { status: 500 })
  }
}

export const GET = withRateLimit(addressHandler, [
  Policies.GEO_ZIP_SHORT,
  Policies.GEO_ZIP_HOURLY
])

