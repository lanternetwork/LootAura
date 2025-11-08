import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { haversineMeters } from '@/lib/geo/distance'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Simple in-memory cache with 60s TTL
interface CacheEntry {
  data: AddressSuggestion[]
  expires: number
}

const suggestCache = new Map<string, CacheEntry>()
const TTL_WITH_COORDS_MS = 60 * 1000
const TTL_NO_COORDS_MS = 5 * 1000

function getCachedSuggestions(key: string): AddressSuggestion[] | null {
  const entry = suggestCache.get(key)
  if (!entry) {
    return null
  }
  
  if (Date.now() > entry.expires) {
    suggestCache.delete(key)
    return null
  }
  
  return entry.data
}

function setCachedSuggestions(key: string, data: AddressSuggestion[], ttlMs: number): void {
  suggestCache.set(key, {
    data,
    expires: Date.now() + ttlMs
  })
}

// Test-only hook: attach a clearing helper to global to avoid Next.js Route export validation errors
if (process.env.NODE_ENV === 'test') {
  (globalThis as any).__clearSuggestCache = () => suggestCache.clear()
}

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

async function suggestHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 10) : 2
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    const userLat = latParam ? parseFloat(latParam) : undefined
    const userLng = lngParam ? parseFloat(lngParam) : undefined
    
    if (!query || query.length < 2) {
      return NextResponse.json({
        ok: false,
        code: 'SHORT_QUERY',
        error: 'Query must be at least 2 characters'
      }, { status: 400 })
    }
    
    // Normalize: trim, collapse whitespace to single space, preserve full string
    const trimmedQuery = query.trim().replace(/\s+/g, ' ')
    const normQ = trimmedQuery.toLowerCase()
    const hasCoords = Number.isFinite(userLat as number) && Number.isFinite(userLng as number)
    
    // Check cache (vary by coords) - don't cache short queries (already rejected above)
    const cacheKey = `suggest:v1:q=${normQ}|L=${limit}|lat=${hasCoords ? userLat : '-'}|lng=${hasCoords ? userLng : '-'}`
    const cached = getCachedSuggestions(cacheKey)
    if (cached) {
      return NextResponse.json({
        ok: true,
        data: cached
      }, {
        headers: {
          'Cache-Control': hasCoords ? 'public, max-age=60' : 'public, max-age=5'
        }
      })
    }
    
    // Fetch from Nominatim
    const email = process.env.NOMINATIM_APP_EMAIL || 'admin@lootaura.com'
    const base = new URL('https://nominatim.openstreetmap.org/search')
    base.searchParams.set('format', 'jsonv2')
    base.searchParams.set('addressdetails', '1')
    base.searchParams.set('countrycodes', 'us')
    const upstreamLimit = hasCoords ? 30 : 10
    base.searchParams.set('limit', String(upstreamLimit))
    base.searchParams.set('email', email)
    
    // Detect numeric-leading queries (e.g., "5001", "5001 pre")
    // Use /^\d{1,8}(\s|$)/ to match 1-8 digits followed by space or end of string
    const isNumericLeading = /^\d{1,8}(\s|$)/.test(trimmedQuery)
    let viewboxApplied = false
    let useStructuredSearch = false
    
    if (hasCoords) {
      // ~25km viewbox for proximity bias
      const d = 25 / 111.32 // ≈ 0.225
      const minLon = (userLng as number) - d
      const minLat = (userLat as number) - d
      const maxLon = (userLng as number) + d
      const maxLat = (userLat as number) + d
      // Nominatim expects viewbox as: left,top,right,bottom (lon,lat) = minLon,maxLat,maxLon,minLat
      base.searchParams.set('viewbox', `${minLon},${maxLat},${maxLon},${minLat}`)
      base.searchParams.set('bounded', '0')
      viewboxApplied = true
    }
    
    // For numeric-leading queries, try structured search first
    if (isNumericLeading) {
      // Use structured search: street=<FULL_INPUT> (preserve full input including trailing text)
      base.searchParams.set('street', trimmedQuery)
      // Include city/state if available (future enhancement: from reverse-geo or chosen location)
      useStructuredSearch = true
    } else {
      // Free-text search
      base.searchParams.set('q', trimmedQuery)
    }
    
    // Fetch from Nominatim (with structured search if applicable)
    let url = base.toString()
    const response = await fetch(url, {
      headers: {
        'User-Agent': `LootAura/1.0 (${email})`
      }
    })
    
    if (!response.ok) {
      // Handle 429 (rate limit) with retry-after header if present
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60'
        return NextResponse.json({
          ok: false,
          error: 'Rate limit exceeded',
          retryAfter: parseInt(retryAfter, 10)
        }, { 
          status: 429,
          headers: {
            'Retry-After': retryAfter
          }
        })
      }
      
      return NextResponse.json({
        ok: false,
        error: `Nominatim request failed: ${response.status}`
      }, { status: response.status })
    }
    
    let data = await response.json()
    
    // If structured search returned empty, fallback to free-text search
    if (useStructuredSearch && (!data || data.length === 0)) {
      try {
        // Retry with free-text search
        const fallbackBase = new URL('https://nominatim.openstreetmap.org/search')
        fallbackBase.searchParams.set('format', 'jsonv2')
        fallbackBase.searchParams.set('addressdetails', '1')
        fallbackBase.searchParams.set('countrycodes', 'us')
        fallbackBase.searchParams.set('limit', String(upstreamLimit))
        fallbackBase.searchParams.set('email', email)
        fallbackBase.searchParams.set('q', trimmedQuery)
        
        if (hasCoords) {
          const d = 25 / 111.32
          const minLon = (userLng as number) - d
          const minLat = (userLat as number) - d
          const maxLon = (userLng as number) + d
          const maxLat = (userLat as number) + d
          fallbackBase.searchParams.set('viewbox', `${minLon},${maxLat},${maxLon},${minLat}`)
          fallbackBase.searchParams.set('bounded', '0')
        }
        
        url = fallbackBase.toString()
        const fallbackResponse = await fetch(url, {
          headers: {
            'User-Agent': `LootAura/1.0 (${email})`
          }
        })
        
        if (fallbackResponse.ok) {
          data = await fallbackResponse.json()
          useStructuredSearch = false // Mark as fallback
        } else {
          // Fallback also failed - return empty results
          data = []
        }
      } catch (fallbackError) {
        // Fallback fetch failed - return empty results
        data = []
      }
    }
    
    // Normalize to AddressSuggestion format
    // Filter to US-only as a defense-in-depth in case upstream ignores countrycodes
    const usOnly = (data || []).filter((item: any) => {
      // If address is missing, upstream was already restricted with countrycodes=us → accept
      if (!item?.address) return true
      const cc = String(item.address.country_code || '').toLowerCase()
      const country = String(item.address.country || '').toLowerCase()
      // Accept common US indicators; fallback to accept when both are empty (still constrained by upstream param)
      return cc === 'us' || country === 'united states' || country === 'us' || country === 'u.s.' || (!cc && !country)
    })

    // Normalize; prefer stable id osm_type:osm_id and concise label
    const toId = (it: any, index: number) => `${(it.osm_type || 'N')}:${(it.osm_id || it.place_id || index)}`
    const conciseLabel = (it: any) => {
      const a = it.address || {}
      const parts = [a.house_number, a.road, a.city || a.town || a.village, a.state, a.postcode].filter(Boolean)
      return parts.length > 0 ? parts.join(', ') : (it.display_name || '')
    }
    // De-dupe by id, keep first occurrence (upstream order)
    const seen = new Set<string>()
    const upstreamIndexed: Array<{ upstreamIndex: number; item: any }> = []
    ;(usOnly || []).forEach((it: any, idx: number) => {
      const id = toId(it, idx)
      if (!seen.has(id)) {
        seen.add(id)
        upstreamIndexed.push({ upstreamIndex: idx, item: it })
      }
    })

    let suggestions: (AddressSuggestion & { __distanceKm?: number; upstreamIndex: number })[] = upstreamIndexed.map(({ upstreamIndex, item }, index) => ({
      id: toId(item, index),
      label: conciseLabel(item),
      lat: parseFloat(item.lat) || 0,
      lng: parseFloat(item.lon) || 0,
      address: item.address ? {
        houseNumber: item.address.house_number,
        road: item.address.road,
        city: item.address.city || item.address.town || item.address.village,
        state: item.address.state,
        postcode: item.address.postcode,
        country: item.address.country
      } : undefined,
      upstreamIndex
    }))

    // If user location provided, compute distance and sort nearest-first (preference, not exclusion)
    if (hasCoords) {
      suggestions = suggestions.map(s => {
        const distM = haversineMeters(userLat as number, userLng as number, s.lat || 0, s.lng || 0)
        return { ...s, __distanceKm: distM / 1000 }
      }).sort((a, b) => {
        const d = (a.__distanceKm || 0) - (b.__distanceKm || 0)
        if (d !== 0) return d
        return a.upstreamIndex - b.upstreamIndex
      })
    }
    // Trim to client limit and strip private fields
    const finalSuggestions: AddressSuggestion[] = suggestions.slice(0, limit).map(({ __distanceKm: _d, upstreamIndex: _i, ...rest }) => rest)
    
    // Cache results with TTL dependent on coords (cacheHit was already determined above)
    const cacheHit = cached !== null
    if (!cacheHit) {
      setCachedSuggestions(cacheKey, finalSuggestions, hasCoords ? TTL_WITH_COORDS_MS : TTL_NO_COORDS_MS)
    }
    
    const respBody: any = {
      ok: true,
      data: finalSuggestions
    }
    
    // Dev-only debug info (also log to console for troubleshooting)
    if (process.env.NODE_ENV === 'development') {
      respBody._debug = {
        viewboxApplied,
        upstreamLimit,
        cacheHit,
        usedCoords: hasCoords,
        userLat: hasCoords ? userLat : undefined,
        userLng: hasCoords ? userLng : undefined,
        suggestionsBeforeTrim: suggestions.length,
        finalCount: finalSuggestions.length,
        distances: hasCoords && suggestions.length > 0 ? suggestions.slice(0, 3).map(s => ({ id: s.id, distanceKm: (s as any).__distanceKm })) : undefined
      }
      console.log('[SUGGEST]', {
        query: query.substring(0, 20),
        hasCoords,
        viewboxApplied,
        upstreamLimit,
        suggestionsCount: finalSuggestions.length,
        firstThreeDistances: hasCoords && suggestions.length > 0 ? suggestions.slice(0, 3).map(s => ({ id: s.id, distanceKm: (s as any).__distanceKm?.toFixed(2) })) : undefined
      })
    }
    
    return NextResponse.json(respBody, {
      headers: {
        'Cache-Control': hasCoords ? 'public, max-age=60' : 'public, max-age=5'
      }
    })
    
  } catch (error: any) {
    console.error('[SUGGEST] Error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export const GET = withRateLimit(suggestHandler, [Policies.GEO_SUGGEST_SHORT])

