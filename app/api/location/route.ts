import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Force dynamic rendering since we access request headers
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const city = request.headers.get('x-vercel-ip-city') || undefined
    const latHeader = request.headers.get('x-vercel-ip-latitude')
    const lngHeader = request.headers.get('x-vercel-ip-longitude')

    const lat = latHeader ? Number(latHeader) : undefined
    const lng = lngHeader ? Number(lngHeader) : undefined

    if (city && typeof lat === 'number' && !Number.isNaN(lat) && typeof lng === 'number' && !Number.isNaN(lng)) {
      return NextResponse.json({ city, lat, lng, source: 'vercel-headers' })
    }

    // Fallbacks: la_loc cookie → neutral US center
    const store = cookies()
    const saved = store.get('la_loc')?.value
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Only use cookie if it has valid coordinates (not a placeholder with lat:0, lng:0)
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number' && 
            parsed.lat !== 0 && parsed.lng !== 0 && !parsed.placeholder) {
          return NextResponse.json({ city: parsed.city || undefined, lat: parsed.lat, lng: parsed.lng, source: 'cookie' })
        }
      } catch (error) {
        // Invalid JSON in cookie - ignore and use fallback
        console.warn('Invalid location cookie:', error)
      }
    }

    return NextResponse.json({ city: 'United States', lat: 39.8283, lng: -98.5795, source: 'fallback' })
  } catch (error) {
    // Do not include sensitive info in errors
    console.error('Location API error:', error)
    return NextResponse.json({ city: 'United States', lat: 39.8283, lng: -98.5795, source: 'fallback' })
  }
}


