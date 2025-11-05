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
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=${limit}&q=${encodeURIComponent(query)}&email=${email}`
    
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

    const suggestions: AddressSuggestion[] = (usOnly || []).map((item: any, index: number) => ({
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

