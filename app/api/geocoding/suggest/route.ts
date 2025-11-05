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
const CACHE_TTL_MS = 60 * 1000 // 60 seconds

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

function setCachedSuggestions(key: string, data: AddressSuggestion[]): void {
  suggestCache.set(key, {
    data,
    expires: Date.now() + CACHE_TTL_MS
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
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 10) : 5
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
    
    // Check cache
    const cacheKey = `${query.toLowerCase()}:${limit}`
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
    base.searchParams.set('limit', String(limit))
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

    let suggestions: (AddressSuggestion & { __distanceKm?: number })[] = (usOnly || []).map((item: any, index: number) => ({
      id: `${item.place_id || index}`,
      label: item.display_name || '',
      lat: parseFloat(item.lat) || 0,
      lng: parseFloat(item.lon) || 0,
      address: item.address ? {
        houseNumber: item.address.house_number,
        road: item.address.road,
        city: item.address.city || item.address.town || item.address.village,
        state: item.address.state,
        postcode: item.address.postcode,
        country: item.address.country
      } : undefined
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
      }).sort((a, b) => (a.__distanceKm || 0) - (b.__distanceKm || 0))
    }
    
    // Cache results
    setCachedSuggestions(cacheKey, suggestions)
    
    return NextResponse.json({
      ok: true,
      data: suggestions
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60'
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

