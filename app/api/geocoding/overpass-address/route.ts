import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { buildOverpassAddressQuery, buildOverpassDigitsStreetQuery, parseOverpassElements, formatLabel, NormalizedAddress } from '@/lib/geo/overpass'
import { normalizeStreetName, buildStreetRegex } from '@/lib/geo/streetNormalize'
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
    const streetParam = searchParams.get('street') // Optional, for digits+street mode
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    const limitParam = searchParams.get('limit')
    const debugParam = searchParams.get('_debug')
    
    const enableDebug = debugParam === '1' || process.env.NODE_ENV === 'development'
    
    // Determine mode: numeric-only (prefix only) or digits+street (prefix + street)
    const mode = streetParam ? 'digits+street' : 'numeric-only'
    
    // Validate prefix (1-6 digits for numeric-only, 1-8 for digits+street)
    const maxPrefixLength = mode === 'digits+street' ? 8 : 6
    if (!prefix || !new RegExp(`^\\d{1,${maxPrefixLength}}$`).test(prefix)) {
      return NextResponse.json({
        ok: false,
        code: 'INVALID_PREFIX',
        error: `Prefix must be 1-${maxPrefixLength} digits`
      }, { status: 400 })
    }
    
    // Validate street parameter for digits+street mode
    if (mode === 'digits+street' && (!streetParam || streetParam.trim().length === 0)) {
      return NextResponse.json({
        ok: false,
        code: 'INVALID_STREET',
        error: 'Street parameter is required for digits+street mode'
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
      ? Math.min(Math.max(parseInt(limitParam, 10), 1), 10)
      : 2
    
    // Round coordinates for cache key (4 decimal places ≈ 11m precision)
    const roundedLat = Math.round((lat as number) * 10000) / 10000
    const roundedLng = Math.round((lng as number) * 10000) / 10000
    
    // Build cache key (include street if present)
    const streetKey = streetParam ? `|street=${normalizeStreetName(streetParam)}` : ''
    const cacheKey = `overpass:v1:prefix=${prefix}${streetKey}|lat=${roundedLat}|lng=${roundedLng}|r=${OVERPASS_RADIUS_M}|L=${limit}`
    const cached = getCachedResults(cacheKey)
    
    if (cached) {
      // Re-sort cached results by distance from actual (non-rounded) coordinates
      // This ensures accuracy even when cache key used rounded coordinates
      const userLat = lat as number
      const userLng = lng as number
      
      const cachedWithDistance = cached.map(addr => ({
        ...addr,
        distanceM: haversineMeters(userLat, userLng, addr.lat, addr.lng)
      }))
      .filter(addr => addr.distanceM <= OVERPASS_RADIUS_M) // Only include results within radius
      
      cachedWithDistance.sort((a, b) => {
        const distDiff = a.distanceM - b.distanceM
        if (distDiff !== 0) return distDiff
        // Use lat/lng as tie-breaker if distances are equal
        if (a.lat !== b.lat) return a.lat - b.lat
        return a.lng - b.lng
      })
      
      // Verify cached results are sorted correctly
      if (enableDebug && cachedWithDistance.length > 1) {
        const sorted = cachedWithDistance.every((addr, idx) => {
          if (idx === 0) return true
          return addr.distanceM >= cachedWithDistance[idx - 1].distanceM
        })
        if (!sorted) {
          console.error('[OVERPASS] WARNING: Cached results are NOT sorted by distance!')
        }
      }
      
      const sortedCached = cachedWithDistance.map(({ distanceM: _d, ...addr }) => addr)
      
      const respBody: any = {
        ok: true,
        data: sortedCached
      }
      
      if (enableDebug) {
        respBody._debug = {
          mode,
          cacheHit: true,
          radiusUsedM: OVERPASS_RADIUS_M,
          radiusM: OVERPASS_RADIUS_M,
          countRaw: sortedCached.length,
          countNormalized: sortedCached.length,
          coords: [lat, lng],
          distances: cachedWithDistance.slice(0, 5).map(addr => ({
            id: addr.id,
            label: addr.label,
            distanceM: Math.round(addr.distanceM),
            distanceKm: (addr.distanceM / 1000).toFixed(2)
          }))
        }
        console.log('[OVERPASS] Cached results re-sorted:', {
          mode,
          prefix,
          street: streetParam || undefined,
          userCoords: [lat, lng],
          count: sortedCached.length,
          firstDistance: cachedWithDistance[0] ? Math.round(cachedWithDistance[0].distanceM) : null,
          firstDistanceKm: cachedWithDistance[0] ? (cachedWithDistance[0].distanceM / 1000).toFixed(2) : null,
          distances: cachedWithDistance.slice(0, 5).map((addr, idx) => ({
            index: idx,
            label: addr.label,
            distanceM: Math.round(addr.distanceM),
            distanceKm: (addr.distanceM / 1000).toFixed(2),
            coords: [addr.lat, addr.lng]
          }))
        })
      }
      
      return NextResponse.json(respBody, {
        headers: {
          'Cache-Control': 'public, max-age=120'
        }
      })
    }
    
    // Build and execute Overpass query with radius expansion for digits+street mode
    const userLat = lat as number
    const userLng = lng as number
    
    let json: any = null
    let rawCount = 0
    let radiusUsed = OVERPASS_RADIUS_M
    const email = process.env.NOMINATIM_APP_EMAIL || 'admin@lootaura.com'
    
    // For digits+street mode, implement radius expansion: 3000m -> 5000m -> 8000m
    // For numeric-only, also expand radius if 0 results: 5000m -> 8000m -> 12000m
    const radiusSequence = mode === 'digits+street' 
      ? [3000, 5000, 8000] 
      : [OVERPASS_RADIUS_M, 8000, 12000] // Expand for numeric-only too
    const minResults = mode === 'digits+street' ? 3 : (mode === 'numeric-only' ? 1 : 0) // Try to get at least 1 result for numeric-only
    
    for (const currentRadius of radiusSequence) {
      radiusUsed = currentRadius
      
      // Build query based on mode
      let query: string
      if (mode === 'digits+street' && streetParam) {
        const normalizedStreet = normalizeStreetName(streetParam)
        const streetRegex = buildStreetRegex(normalizedStreet)
        query = buildOverpassDigitsStreetQuery(
          prefix,
          streetRegex,
          userLat,
          userLng,
          currentRadius,
          OVERPASS_TIMEOUT_SEC
        )
      } else {
        query = buildOverpassAddressQuery(
          prefix,
          userLat,
          userLng,
          currentRadius,
          OVERPASS_TIMEOUT_SEC
        )
      }
      
      if (enableDebug) {
        console.log('[OVERPASS] Query parameters:', {
          mode,
          prefix,
          street: streetParam || undefined,
          userLat,
          userLng,
          radiusM: currentRadius,
          radiusKm: (currentRadius / 1000).toFixed(2)
        })
      }
      
      // Fetch from Overpass with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS)
      
      let response: Response
      
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
      
      // For digits+street mode, continue expanding radius if we have < 3 results
      // For numeric-only mode, continue expanding radius if we have 0 results
      const shouldExpand = mode === 'digits+street' 
        ? (rawCount < minResults && currentRadius < radiusSequence[radiusSequence.length - 1])
        : (mode === 'numeric-only' && rawCount === 0 && currentRadius < radiusSequence[radiusSequence.length - 1])
      
      if (shouldExpand) {
        if (enableDebug) {
          console.log(`[OVERPASS] Only ${rawCount} results at ${currentRadius}m, expanding radius...`)
        }
        continue // Try next radius
      }
      
      break // We have enough results or reached max radius
    }
    
    // Parse and normalize
    const normalized = parseOverpassElements(json)
    
    // Calculate distances and filter by radiusUsed + 500m buffer
    const filterRadius = radiusUsed + 500 // Allow 500m buffer beyond search radius
    
    if (enableDebug) {
      console.log('[OVERPASS] Distance calculation:', {
        userCoords: [userLat, userLng],
        normalizedCount: normalized.length,
        radiusUsedM: radiusUsed,
        filterRadiusM: filterRadius,
        sampleAddress: normalized[0] ? {
          label: formatLabel(normalized[0]),
          coords: [normalized[0].lat, normalized[0].lng],
          calculatedDistance: Math.round(haversineMeters(userLat, userLng, normalized[0].lat, normalized[0].lng))
        } : null
      })
    }
    
    const withDistance: (NormalizedAddress & { distanceM: number })[] = normalized
      .map(addr => {
        const distanceM = haversineMeters(userLat, userLng, addr.lat, addr.lng)
        return {
          ...addr,
          distanceM
        }
      })
      .filter(addr => {
        const withinRadius = addr.distanceM <= filterRadius
        if (enableDebug && !withinRadius) {
          console.log('[OVERPASS] Filtered out (outside radius):', {
            label: formatLabel(addr),
            distanceM: Math.round(addr.distanceM),
            distanceKm: (addr.distanceM / 1000).toFixed(2),
            radiusUsedM: radiusUsed,
            filterRadiusM: filterRadius,
            userCoords: [userLat, userLng],
            addrCoords: [addr.lat, addr.lng]
          })
        }
        return withinRadius
      }) // Only include results within radiusUsed + 500m buffer
    
    // Sort by distance (ascending) - closest first
    withDistance.sort((a, b) => {
      const distDiff = a.distanceM - b.distanceM
      if (distDiff !== 0) return distDiff
      return a.upstreamIndex - b.upstreamIndex
    })
    
    // Verify sorting is correct (for debugging)
    if (enableDebug && withDistance.length > 1) {
      const sorted = withDistance.every((addr, idx) => {
        if (idx === 0) return true
        return addr.distanceM >= withDistance[idx - 1].distanceM
      })
      if (!sorted) {
        console.error('[OVERPASS] WARNING: Results are NOT sorted by distance!', {
          distances: withDistance.map((addr, idx) => ({
            index: idx,
            label: formatLabel(addr),
            distanceM: Math.round(addr.distanceM),
            distanceKm: (addr.distanceM / 1000).toFixed(2)
          }))
        })
      }
    }
    
    if (enableDebug) {
      console.log('[OVERPASS] After sorting:', {
        normalizedCount: normalized.length,
        withinRadius: withDistance.length,
        firstDistance: withDistance[0] ? Math.round(withDistance[0].distanceM) : null,
        firstDistanceKm: withDistance[0] ? (withDistance[0].distanceM / 1000).toFixed(2) : null,
        distances: withDistance.slice(0, 10).map((addr, idx) => ({
          index: idx,
          label: formatLabel(addr),
          distanceM: Math.round(addr.distanceM),
          distanceKm: (addr.distanceM / 1000).toFixed(2),
          coords: [addr.lat, addr.lng],
          userCoords: [userLat, userLng]
        }))
      })
    }
    
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
        mode,
        cacheHit: false,
        radiusUsedM: radiusUsed,
        radiusM: OVERPASS_RADIUS_M,
        countRaw: rawCount,
        countNormalized: normalized.length,
        coords: [lat, lng],
        distances: withDistance.slice(0, 5).map(addr => ({
          id: addr.id,
          label: formatLabel(addr),
          distanceM: Math.round(addr.distanceM),
          distanceKm: (addr.distanceM / 1000).toFixed(2)
        }))
      }
      console.log('[OVERPASS] Sorted results (final):', {
        mode,
        prefix,
        street: streetParam || undefined,
        userCoords: [userLat, userLng],
        radiusUsedM: radiusUsed,
        count: suggestions.length,
        limit,
        distances: withDistance.slice(0, limit).map((addr, idx) => ({
          index: idx,
          label: formatLabel(addr),
          distanceM: Math.round(addr.distanceM),
          distanceKm: (addr.distanceM / 1000).toFixed(2),
          coords: [addr.lat, addr.lng]
        })),
        firstResult: suggestions[0] ? {
          label: suggestions[0].label,
          distanceM: Math.round(withDistance[0]?.distanceM || 0),
          distanceKm: ((withDistance[0]?.distanceM || 0) / 1000).toFixed(2)
        } : null
      })
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

