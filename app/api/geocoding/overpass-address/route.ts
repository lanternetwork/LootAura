import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { buildOverpassAddressQuery, parseOverpassElements, formatLabel, NormalizedAddress } from '@/lib/geo/overpass'
import { haversineMeters } from '@/lib/geo/distance'
import { AddressSuggestion } from '@/lib/geocode'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Environment configuration
const OVERPASS_BASE_URL = process.env.OVERPASS_BASE_URL || 'https://overpass-api.de/api/interpreter'
const OVERPASS_TIMEOUT_MS = parseInt(process.env.OVERPASS_TIMEOUT_MS || '8000', 10)
const OVERPASS_RADIUS_M = parseInt(process.env.OVERPASS_RADIUS_M || '5000', 10)
const OVERPASS_TIMEOUT_SEC = Math.floor(OVERPASS_TIMEOUT_MS / 1000)

// In-memory cache with 120s TTL
interface CacheEntry {
  data: AddressSuggestion[]
  expires: number
}

const overpassCache = new Map<string, CacheEntry>()
const TTL_MS = 120 * 1000 // 120 seconds

function getCachedResults(key: string): AddressSuggestion[] | null {
  const entry = overpassCache.get(key)
  if (!entry) {
    return null
  }
  
  if (Date.now() > entry.expires) {
    overpassCache.delete(key)
    return null
  }
  
  return entry.data
}

function setCachedResults(key: string, data: AddressSuggestion[], ttlMs: number): void {
  overpassCache.set(key, {
    data,
    expires: Date.now() + ttlMs
  })
}

// Test-only hook
if (process.env.NODE_ENV === 'test') {
  (globalThis as any).__clearOverpassCache = () => overpassCache.clear()
}

async function overpassHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const prefix = searchParams.get('prefix')
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    const limitParam = searchParams.get('limit')
    const debugParam = searchParams.get('_debug')
    
    const enableDebug = debugParam === '1' || process.env.NODE_ENV === 'development'
    
    // Validate prefix
    if (!prefix || !/^\d{1,6}$/.test(prefix)) {
      return NextResponse.json({
        ok: false,
        code: 'INVALID_PREFIX',
        error: 'Prefix must be 1-6 digits'
      }, { status: 400 })
    }
    
    // Validate coordinates
    const lat = latParam ? parseFloat(latParam) : undefined
    const lng = lngParam ? parseFloat(lngParam) : undefined
    
    if (!Number.isFinite(lat as number) || !Number.isFinite(lng as number)) {
      return NextResponse.json({
        ok: false,
        code: 'NO_COORDS',
        error: 'Latitude and longitude are required'
      }, { status: 400 })
    }
    
    // Validate and clamp limit
    const limit = limitParam 
      ? Math.min(Math.max(parseInt(limitParam, 10), 3), 10)
      : 8
    
    // Round coordinates for cache key (4 decimal places ≈ 11m precision)
    const roundedLat = Math.round((lat as number) * 10000) / 10000
    const roundedLng = Math.round((lng as number) * 10000) / 10000
    
    // Check cache
    const cacheKey = `overpass:v1:prefix=${prefix}|lat=${roundedLat}|lng=${roundedLng}|r=${OVERPASS_RADIUS_M}|L=${limit}`
    const cached = getCachedResults(cacheKey)
    
    if (cached) {
      const respBody: any = {
        ok: true,
        data: cached
      }
      
      if (enableDebug) {
        respBody._debug = {
          cacheHit: true,
          radiusM: OVERPASS_RADIUS_M,
          countRaw: cached.length,
          countNormalized: cached.length,
          coords: [lat, lng]
        }
      }
      
      return NextResponse.json(respBody, {
        headers: {
          'Cache-Control': 'public, max-age=120'
        }
      })
    }
    
    // Build Overpass query
    const query = buildOverpassAddressQuery(
      prefix,
      lat as number,
      lng as number,
      OVERPASS_RADIUS_M,
      OVERPASS_TIMEOUT_SEC
    )
    
    // Fetch from Overpass with timeout
    const email = process.env.NOMINATIM_APP_EMAIL || 'admin@lootaura.com'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS)
    
    let response: Response
    let rawCount = 0
    
    try {
      response = await fetch(OVERPASS_BASE_URL, {
        method: 'POST',
        headers: {
          'User-Agent': `LootAura/1.0 (${email})`,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      // Handle timeout or abort
      if (fetchError?.name === 'AbortError' || controller.signal.aborted) {
        return NextResponse.json({
          ok: false,
          code: 'OVERPASS_UNAVAILABLE',
          error: 'Overpass request timed out'
        }, { status: 504 })
      }
      
      // Other fetch errors
      return NextResponse.json({
        ok: false,
        code: 'OVERPASS_UNAVAILABLE',
        error: 'Overpass request failed'
      }, { status: 503 })
    }
    
    if (!response.ok) {
      // Handle 429 rate limit
      if (response.status === 429) {
        return NextResponse.json({
          ok: false,
          code: 'OVERPASS_UNAVAILABLE',
          error: 'Overpass rate limit exceeded'
        }, { status: 429 })
      }
      
      // Other errors
      return NextResponse.json({
        ok: false,
        code: 'OVERPASS_UNAVAILABLE',
        error: `Overpass request failed: ${response.status}`
      }, { status: response.status })
    }
    
    // Parse response
    let json: any
    try {
      json = await response.json()
    } catch (parseError) {
      return NextResponse.json({
        ok: false,
        code: 'OVERPASS_UNAVAILABLE',
        error: 'Invalid response from Overpass'
      }, { status: 502 })
    }
    
    rawCount = json.elements?.length || 0
    
    // Parse and normalize
    const normalized = parseOverpassElements(json)
    
    // Calculate distances and sort
    const withDistance: (NormalizedAddress & { distanceM: number })[] = normalized.map(addr => ({
      ...addr,
      distanceM: haversineMeters(lat as number, lng as number, addr.lat, addr.lng)
    }))
    
    // Sort by distance (ascending)
    withDistance.sort((a, b) => {
      const distDiff = a.distanceM - b.distanceM
      if (distDiff !== 0) return distDiff
      return a.upstreamIndex - b.upstreamIndex
    })
    
    // Convert to AddressSuggestion format and trim to limit
    const suggestions: AddressSuggestion[] = withDistance.slice(0, limit).map((addr) => ({
      id: addr.id,
      label: formatLabel(addr),
      lat: addr.lat,
      lng: addr.lng,
      address: {
        houseNumber: addr.houseNumber,
        road: addr.street,
        city: addr.city,
        state: addr.state,
        postcode: addr.postcode,
        country: addr.country
      }
    }))
    
    // Cache results
    setCachedResults(cacheKey, suggestions, TTL_MS)
    
    const respBody: any = {
      ok: true,
      data: suggestions
    }
    
    if (enableDebug) {
      respBody._debug = {
        cacheHit: false,
        radiusM: OVERPASS_RADIUS_M,
        countRaw: rawCount,
        countNormalized: normalized.length,
        coords: [lat, lng]
      }
    }
    
    return NextResponse.json(respBody, {
      headers: {
        'Cache-Control': 'public, max-age=120'
      }
    })
    
  } catch (error: any) {
    console.error('[OVERPASS] Error:', error)
    return NextResponse.json({
      ok: false,
      code: 'OVERPASS_UNAVAILABLE',
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export const GET = withRateLimit(overpassHandler, [Policies.GEO_OVERPASS_SHORT])

