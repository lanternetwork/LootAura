import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

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
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 10) : 8
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    const userLat = latParam ? parseFloat(latParam) : undefined
    const userLng = lngParam ? parseFloat(lngParam) : undefined
    
    if (!query || query.length < 3) {
      return NextResponse.json({
        ok: false,
        error: 'Query must be at least 3 characters'
      }, { status: 400 })
    }
    
    // Check cache (vary by coords)
    const normQ = query.trim().toLowerCase()
    const cacheKey = `suggest:v1:q=${normQ}|L=${limit}|lat=${Number.isFinite(userLat as number) ? userLat : '-'}|lng=${Number.isFinite(userLng as number) ? userLng : '-'}`
    const cached = getCachedSuggestions(cacheKey)
    if (cached) {
      return NextResponse.json({
        ok: true,
        data: cached
      }, {
        headers: {
          'Cache-Control': 'public, max-age=60'
        }
      })
    }
    
    // Fetch from Nominatim
    const email = process.env.NOMINATIM_APP_EMAIL || 'admin@lootaura.com'
    // Restrict to United States only using countrycodes=us
    const base = new URL('https://nominatim.openstreetmap.org/search')
    base.searchParams.set('format', 'json')
    base.searchParams.set('addressdetails', '1')
    base.searchParams.set('countrycodes', 'us')
    const upstreamLimit = Number.isFinite(userLat as number) && Number.isFinite(userLng as number) ? 20 : 7
    base.searchParams.set('limit', String(upstreamLimit))
    base.searchParams.set('q', query)
    base.searchParams.set('email', email)
    // Proximity bias: include a viewbox around the user to influence ranking (not bounded)
    if (Number.isFinite(userLat as number) && Number.isFinite(userLng as number)) {
      const radiusKm = 50
      const dLat = radiusKm / 111
      const dLng = radiusKm / (111 * Math.cos((userLat as number) * Math.PI / 180))
      const top = (userLat as number) + dLat
      const bottom = (userLat as number) - dLat
      const left = (userLng as number) - dLng
      const right = (userLng as number) + dLng
      // Nominatim expects viewbox as: left,top,right,bottom (lon,lat)
      base.searchParams.set('viewbox', `${left},${top},${right},${bottom}`)
      base.searchParams.set('bounded', '0')
    }
    const url = base.toString()
    
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
    
    const data = await response.json()
    
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
    let upstreamIndexed: Array<{ upstreamIndex: number; item: any }> = []
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
    if (Number.isFinite(userLat as number) && Number.isFinite(userLng as number)) {
      const R = 6371 // km
      suggestions = suggestions.map(s => {
        const dLat = ((s.lat || 0) - (userLat as number)) * Math.PI / 180
        const dLng = ((s.lng || 0) - (userLng as number)) * Math.PI / 180
        const a = Math.sin(dLat/2) ** 2 + Math.cos((userLat as number) * Math.PI/180) * Math.cos((s.lat || 0) * Math.PI/180) * Math.sin(dLng/2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return { ...s, __distanceKm: R * c }
      }).sort((a, b) => {
        const d = (a.__distanceKm || 0) - (b.__distanceKm || 0)
        if (d !== 0) return d
        return a.upstreamIndex - b.upstreamIndex
      })
    }
    // Trim to client limit and strip private fields
    const finalSuggestions: AddressSuggestion[] = suggestions.slice(0, limit).map(({ __distanceKm, upstreamIndex, ...rest }) => rest)
    
    // Cache results with TTL dependent on coords
    setCachedSuggestions(cacheKey, finalSuggestions, (Number.isFinite(userLat as number) && Number.isFinite(userLng as number)) ? TTL_WITH_COORDS_MS : TTL_NO_COORDS_MS)
    
    return NextResponse.json({
      ok: true,
      data: finalSuggestions
    }, {
      headers: {
        'Cache-Control': Number.isFinite(userLat as number) && Number.isFinite(userLng as number) ? 'public, max-age=60' : 'public, max-age=5'
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

