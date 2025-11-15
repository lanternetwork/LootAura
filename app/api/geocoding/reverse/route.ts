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
    
    // Fetch from Nominatim with retry logic
    const { retry, isTransientError } = await import('@/lib/utils/retry')
    const { getNominatimEmail } = await import('@/lib/env')
    const email = getNominatimEmail()
    
    let data: any
    try {
      data = await retry(
        async () => {
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}&email=${email}`
          
          const response = await fetch(url, {
            headers: {
              'User-Agent': `LootAura/1.0 (${email})`
            }
          })
          
          if (!response.ok) {
            // Handle 429 (rate limit) - don't retry, throw special error
            if (response.status === 429) {
              const retryAfter = response.headers.get('Retry-After') || '60'
              const rateLimitError: any = new Error('Rate limit exceeded')
              rateLimitError.isRateLimit = true
              rateLimitError.retryAfter = parseInt(retryAfter, 10)
              throw rateLimitError
            }
            
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
          retryable: (error) => {
            // Don't retry rate limit errors
            if (error && typeof error === 'object' && 'isRateLimit' in error) {
              return false
            }
            return isTransientError(error)
          },
        }
      )
    } catch (error: any) {
      // Handle rate limit error
      if (error?.isRateLimit) {
        return NextResponse.json({
          ok: false,
          error: 'Rate limit exceeded',
          retryAfter: error.retryAfter || 60
        }, { 
          status: 429,
          headers: {
            'Retry-After': String(error.retryAfter || 60)
          }
        })
      }
      
      // Re-throw other errors
      throw error
    }
    
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

