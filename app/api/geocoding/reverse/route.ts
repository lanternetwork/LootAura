import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

async function reverseHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    
    if (!latParam || !lngParam) {
      return NextResponse.json({
        ok: false,
        error: 'lat and lng parameters are required'
      }, { status: 400 })
    }
    
    const lat = parseFloat(latParam)
    const lng = parseFloat(lngParam)
    
    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid lat or lng values'
      }, { status: 400 })
    }
    
    // Fetch from Nominatim
    const email = process.env.NOMINATIM_APP_EMAIL || 'admin@lootaura.com'
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}&email=${email}`
    
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
    
    if (!data || !data.lat || !data.lon) {
      return NextResponse.json({
        ok: false,
        error: 'No results found'
      }, { status: 404 })
    }
    
    // Normalize to AddressSuggestion format
    const suggestion: AddressSuggestion = {
      id: `${data.place_id || 'reverse'}`,
      label: data.display_name || '',
      lat: parseFloat(data.lat) || lat,
      lng: parseFloat(data.lon) || lng,
      address: data.address ? {
        houseNumber: data.address.house_number,
        road: data.address.road,
        city: data.address.city || data.address.town || data.address.village,
        state: data.address.state,
        postcode: data.address.postcode,
        country: data.address.country
      } : undefined
    }
    
    return NextResponse.json({
      ok: true,
      data: suggestion
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600' // Cache reverse lookups longer (1 hour)
      }
    })
    
  } catch (error: any) {
    console.error('[REVERSE] Error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export const GET = withRateLimit(reverseHandler, [Policies.GEO_REVERSE_SHORT])

