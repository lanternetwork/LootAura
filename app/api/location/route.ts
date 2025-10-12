import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

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
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return NextResponse.json({ city: parsed.city || undefined, lat: parsed.lat, lng: parsed.lng, source: 'cookie' })
        }
      } catch {}
    }

    return NextResponse.json({ city: 'United States', lat: 39.8283, lng: -98.5795, source: 'fallback' })
  } catch {
    // Do not include sensitive info in errors
    return NextResponse.json({ city: 'United States', lat: 39.8283, lng: -98.5795, source: 'fallback' })
  }
}


