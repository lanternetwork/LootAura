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
    let q = searchParams.get('q') || ''
    
    // Normalize whitespace: replace + with space (defensive URL encoding handling),
    // collapse multiple whitespace to single space, then trim
    q = q.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim()
    
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    const limitParam = searchParams.get('limit')
    const debugParam = searchParams.get('_debug')
    
    // Only enable debug in non-production environments
    const enableDebug = (debugParam === '1' || process.env.NODE_ENV === 'development') && process.env.NODE_ENV !== 'production'
    
    // Classify input on server side
    // Numeric-only mode: /^\d{1,6}$/
    // Digits+street mode: /^(?<num>\d{1,8})\s+(?<street>[A-Za-z].+)$/
    // Else: fall back to existing Nominatim flow (return error to trigger fallback)
    let mode: 'numeric-only' | 'digits+street'
    let prefix: string
    let streetParam: string | undefined
    
    if (/^\d{1,6}$/.test(q)) {
      mode = 'numeric-only'
      prefix = q
      streetParam = undefined
    } else {
      // More lenient regex: allow digits followed by space and at least one letter (can be abbreviated like "h", "hy", "hwy")
      const digitsStreetMatch = q.match(/^(?<num>\d{1,8})\s+(?<street>[A-Za-z].*)$/)
      if (digitsStreetMatch?.groups && digitsStreetMatch.groups.street.trim().length > 0) {
        mode = 'digits+street'
        prefix = digitsStreetMatch.groups.num
        streetParam = digitsStreetMatch.groups.street.trim()
      } else {
        // Not a match for Overpass modes - return error to trigger Nominatim fallback
        return NextResponse.json({
          ok: false,
          code: 'INVALID_QUERY',
          error: 'Query must be numeric-only (1-6 digits) or digits+street (1-8 digits followed by street name)'
        }, { status: 400 })
      }
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
    
    // Validate and clamp limit (default 8 per spec)
    const limit = limitParam 
      ? Math.min(Math.max(parseInt(limitParam, 10), 1), 10)
      : 8
    // Internal search cap: always try to gather up to 8 to avoid stopping too early when client displays 2
    const searchCap = Math.max(8, limit)
    
    // Round coordinates for cache key (5 decimal places ≈ 1.1m precision per spec)
    const roundedLat = Math.round((lat as number) * 100000) / 100000
    const roundedLng = Math.round((lng as number) * 100000) / 100000
    
    // Build cache key per spec: overpass:v2:mode=<numeric|digits+street>|q=<normalized input>|lat=<round5>|lng=<round5>|L=<limit>
    // Note: We don't include radius in cache key since we're not filtering by radius - just sorting by distance
    // The normalized query string for cache key
    const normalizedQ = mode === 'digits+street' && streetParam
      ? `${prefix} ${normalizeStreetName(streetParam)}`
      : prefix
    
    // Build cache key (no radius since we don't filter by it)
    const cacheKey = `overpass:v2:mode=${mode}|q=${normalizedQ}|lat=${roundedLat}|lng=${roundedLng}|L=${limit}`
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
      // No radius filtering - show all results sorted by distance
      
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
      
      // Only include _debug in non-production environments
      if (enableDebug && process.env.NODE_ENV !== 'production') {
        const distancesM = cachedWithDistance.slice(0, limit).map(addr => Math.round(addr.distanceM))
        
        respBody._debug = {
          mode,
          coords: [lat, lng],
          radiiTriedM: [],
          radiusUsedM: 0, // Unknown for cached results
          countRaw: sortedCached.length,
          countNormalized: sortedCached.length,
          distancesM: distancesM,
          cacheHit: true
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
    
    // Build and execute Overpass query with progressive radius expansion
    // Progressive search per spec: [1000, 3000, 10000, 30000, 100000, 300000, 1000000, 2000000, 3000000]
    // Escalate until at least 1-3 valid candidates are found, then stop
    const userLat = lat as number
    const userLng = lng as number
    
    let json: any = null
    let rawCount = 0
    let radiusUsed = 1000 // Start with first radius
    const email = process.env.NOMINATIM_APP_EMAIL || 'admin@lootaura.com'
    
    // Progressive radius expansion per spec
    const radiusSequence = [1000, 3000, 10000, 30000, 100000, 300000, 1000000, 2000000, 3000000] // meters
    const radiiTriedM: number[] = [] // Track radii tried for debug output
    
    // Store best results found during expansion
    let bestResults: (NormalizedAddress & { distanceM: number })[] = []
    let bestJson: any = null
    
    for (const currentRadius of radiusSequence) {
      radiusUsed = currentRadius
      radiiTriedM.push(currentRadius)
      
      // Build query based on mode
      let query: string
      try {
        if (mode === 'digits+street' && streetParam) {
          const normalizedStreet = normalizeStreetName(streetParam)
          const streetRegex = buildStreetRegex(normalizedStreet)
          
          // Validate normalized street is not empty after normalization
          if (!normalizedStreet || normalizedStreet.trim().length === 0) {
            if (enableDebug) {
              console.log('[OVERPASS] Street normalized to empty, skipping this radius')
            }
            continue // Skip this radius, try next
          }
          
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
      } catch (queryError: any) {
        if (enableDebug) {
          console.error('[OVERPASS] Query build error:', queryError)
        }
        // If query building fails, try next radius or break out of loop
        // (we'll return empty results to allow client to fall back to Nominatim)
        if (currentRadius >= radiusSequence[radiusSequence.length - 1]) {
          // Last radius failed - break out of loop, we'll return empty results
          break
        }
        continue // Try next radius
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
      
      // Parse and normalize to check if we have enough valid results
      const normalized = parseOverpassElements(json)
      
      // Apply US-only filtering per spec
      // Prefer candidates with addr:country_code in {"us", "US"} or addr:country including "United States"
      // If the tag is missing, keep the candidate (many OSM address points omit it)
      const usFiltered = normalized.filter(addr => {
        const countryCode = addr.countryCode?.toLowerCase() || addr.country?.toLowerCase()
        const country = addr.country?.toLowerCase()
        
        // Prefer US addresses
        if (countryCode === 'us' || country?.includes('united states')) {
          return true
        }
        
        // Keep addresses without country tags (common in OSM)
        if (!addr.country && !addr.countryCode) {
          return true
        }
        
        // Filter out non-US addresses only if we have enough US candidates
        // For now, we'll keep all addresses and let distance sorting prioritize US results
        // (since we center on US coords, distance naturally prioritizes US)
        return true
      })
      
      // Calculate distances for all US-filtered results
      const withDistance: (NormalizedAddress & { distanceM: number })[] = usFiltered
        .map(addr => {
          const distanceM = haversineMeters(userLat, userLng, addr.lat, addr.lng)
          return {
            ...addr,
            distanceM
          }
        })
      
      // Sort by distance (ascending) - closest first
      withDistance.sort((a, b) => {
        const distDiff = a.distanceM - b.distanceM
        if (distDiff !== 0) return distDiff
        return a.upstreamIndex - b.upstreamIndex
      })
      
      // Store best results found so far
      if (withDistance.length > bestResults.length) {
        bestResults = withDistance
        bestJson = json
      }
      
      // Check if we have enough results (≥ display limit OR up to reasonable cap)
      if (withDistance.length >= searchCap && currentRadius < radiusSequence[radiusSequence.length - 1]) {
        // We have enough results, use this radius
        bestResults = withDistance
        bestJson = json
        if (enableDebug) {
          console.log(`[OVERPASS] Found ${withDistance.length} valid results at ${currentRadius}m (≥ searchCap ${searchCap}), stopping expansion`)
        }
        break
      }
      
      // Continue expanding if we don't have enough results and haven't reached max radius
      if (withDistance.length < limit && currentRadius < radiusSequence[radiusSequence.length - 1]) {
        if (enableDebug) {
          console.log(`[OVERPASS] Only ${withDistance.length} valid results at ${currentRadius}m (need ${limit}), expanding radius...`)
        }
        continue // Try next radius
      }
      
      // We've reached max radius or have some results, use what we have
      bestResults = withDistance
      bestJson = json
      break
    }
    
    // Use best results from expansion loop
    let withDistance = bestResults
    json = bestJson

    // If we have no results after trying all radii, perform a final US-area sweep
    if (withDistance.length === 0 && mode === 'digits+street' && streetParam) {
      try {
        const normalizedStreet = normalizeStreetName(streetParam)
        const streetRegex = buildStreetRegex(normalizedStreet) // token-AND prefix regex
        // Overpass US area sweep (ISO3166-1=US)
        const timeoutSec = OVERPASS_TIMEOUT_SEC
        const usAreaQuery = `
          [out:json][timeout:${timeoutSec}];
          area["ISO3166-1"="US"][admin_level=2]->.searchArea;
          (
            node["addr:housenumber"~"^${prefix}"]["addr:street"~"(?i)${streetRegex}"](area.searchArea);
            way["addr:housenumber"~"^${prefix}"]["addr:street"~"(?i)${streetRegex}"](area.searchArea);
            relation["addr:housenumber"~"^${prefix}"]["addr:street"~"(?i)${streetRegex}"](area.searchArea);
          );
          out center 100;
        `
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS)
        const response = await fetch(OVERPASS_BASE_URL, {
          method: 'POST',
          headers: {
            'User-Agent': `LootAura/1.0 (${email})`,
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `data=${encodeURIComponent(usAreaQuery)}`,
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const usJson = await response.json()
          const normalized = parseOverpassElements(usJson)
          const withDist = normalized.map(addr => ({
            ...addr,
            distanceM: haversineMeters(userLat, userLng, addr.lat, addr.lng)
          }))
          withDist.sort((a, b) => a.distanceM - b.distanceM)
          withDistance = withDist
        }
      } catch {
        // ignore and fall back
      }
    }

    // If still no results after US-area sweep, return empty (client will fall back to Nominatim)
    if (withDistance.length === 0) {
      // Cache empty very briefly to avoid hammering
      setCachedResults(cacheKey, [], 10_000) // 10s TTL for empties
      return NextResponse.json({ ok: true, data: [] }, { headers: { 'Cache-Control': 'public, max-age=10' } })
    }
    
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
    
    // Cache results (cache key doesn't include radius since we don't filter by it)
    setCachedResults(cacheKey, suggestions, TTL_MS)
    
    const respBody: any = {
      ok: true,
      data: suggestions
    }
    
    // Only include _debug in non-production environments
    if (enableDebug && process.env.NODE_ENV !== 'production') {
      const distancesM = withDistance.slice(0, limit).map(addr => Math.round(addr.distanceM))
      
      respBody._debug = {
        mode,
        coords: [lat, lng],
        radiiTriedM: radiiTriedM,
        radiusUsedM: radiusUsed,
        countRaw: rawCount,
        countNormalized: withDistance.length,
        distancesM: distancesM,
        cacheHit: false
      }
      
      console.log('[OVERPASS] Final sorted results:', {
        mode,
        q,
        prefix,
        street: streetParam || undefined,
        userCoords: [userLat, userLng],
        radiiTriedM,
        radiusUsedM: radiusUsed,
        count: suggestions.length,
        limit,
        distancesM,
        firstResult: suggestions[0] ? {
          label: suggestions[0].label,
          distanceM: distancesM[0],
          distanceKm: (distancesM[0] / 1000).toFixed(2)
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

