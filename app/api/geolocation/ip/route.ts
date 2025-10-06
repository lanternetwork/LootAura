import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers()
    
    // Try to get location from Vercel IP headers first
    const vercelLat = headersList.get('x-vercel-ip-latitude')
    const vercelLng = headersList.get('x-vercel-ip-longitude')
    const vercelCity = headersList.get('x-vercel-ip-city')
    const vercelCountry = headersList.get('x-vercel-ip-country')

    console.log('[IP_GEOLOCATION] Vercel headers:', { vercelLat, vercelLng, vercelCity, vercelCountry })

    if (vercelLat && vercelLng) {
      console.log('[IP_GEOLOCATION] Using Vercel location:', { lat: vercelLat, lng: vercelLng })
      return NextResponse.json({
        lat: parseFloat(vercelLat),
        lng: parseFloat(vercelLng),
        city: vercelCity,
        country: vercelCountry,
        source: 'vercel'
      })
    }

    // Fallback to external IP geolocation API
    const clientIP = headersList.get('x-forwarded-for') || 
                     headersList.get('x-real-ip') || 
                     request.ip ||
                     '127.0.0.1'

    console.log('[IP_GEOLOCATION] Client IP:', clientIP)
    console.log('[IP_GEOLOCATION] Trying ipapi.co...')

    const response = await fetch(`https://ipapi.co/${clientIP}/json/`)
    
    if (!response.ok) {
      console.log('[IP_GEOLOCATION] ipapi.co failed:', response.status, response.statusText)
      throw new Error('IP geolocation API failed')
    }

    const data = await response.json()
    console.log('[IP_GEOLOCATION] ipapi.co response:', data)
    
    if (data.latitude && data.longitude) {
      console.log('[IP_GEOLOCATION] Using ipapi.co location:', { lat: data.latitude, lng: data.longitude })
      return NextResponse.json({
        lat: parseFloat(data.latitude),
        lng: parseFloat(data.longitude),
        city: data.city,
        state: data.region,
        country: data.country_name,
        source: 'ipapi'
      })
    }

    // Final fallback to Louisville, KY
    console.log('[IP_GEOLOCATION] Using Louisville fallback')
    return NextResponse.json({
      lat: 38.2527,
      lng: -85.7585,
      city: 'Louisville',
      state: 'KY',
      country: 'US',
      source: 'fallback'
    })

  } catch (error) {
    console.error('[IP_GEOLOCATION] Error:', error)
    
    // Return fallback location on error
    console.log('[IP_GEOLOCATION] Using error fallback')
    return NextResponse.json({
      lat: 38.2527,
      lng: -85.7585,
      city: 'Louisville',
      state: 'KY',
      country: 'US',
      source: 'fallback'
    })
  }
}
