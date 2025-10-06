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

    // Fallback to external IP geolocation APIs (try multiple for better accuracy)
    const clientIP = headersList.get('x-forwarded-for') || 
                     headersList.get('x-real-ip') || 
                     request.ip ||
                     '127.0.0.1'

    console.log('[IP_GEOLOCATION] Client IP:', clientIP)
    
    // Try multiple geolocation services for better accuracy
    const services = [
      { name: 'ipapi.co', url: `https://ipapi.co/${clientIP}/json/` },
      { name: 'ip-api.com', url: `http://ip-api.com/json/${clientIP}` },
      { name: 'ipinfo.io', url: `https://ipinfo.io/${clientIP}/json` }
    ]
    
    for (const service of services) {
      try {
        console.log(`[IP_GEOLOCATION] Trying ${service.name}...`)
        const response = await fetch(service.url, { 
          timeout: 5000,
          headers: { 'User-Agent': 'LootAura/1.0' }
        })
        
        if (!response.ok) {
          console.log(`[IP_GEOLOCATION] ${service.name} failed:`, response.status, response.statusText)
          continue
        }

        const data = await response.json()
        console.log(`[IP_GEOLOCATION] ${service.name} response:`, data)
        
        let lat, lng, city, state, country
        
        if (service.name === 'ipapi.co') {
          lat = data.latitude
          lng = data.longitude
          city = data.city
          state = data.region
          country = data.country_name
        } else if (service.name === 'ip-api.com') {
          lat = data.lat
          lng = data.lon
          city = data.city
          state = data.region
          country = data.country
        } else if (service.name === 'ipinfo.io') {
          const loc = data.loc?.split(',')
          lat = loc?.[0]
          lng = loc?.[1]
          city = data.city
          state = data.region
          country = data.country
        }
        
        if (lat && lng) {
          console.log(`[IP_GEOLOCATION] Using ${service.name} location:`, { lat, lng, city, state })
          return NextResponse.json({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            city: city,
            state: state,
            country: country,
            source: service.name
          })
        }
      } catch (error) {
        console.log(`[IP_GEOLOCATION] ${service.name} error:`, error)
        continue
      }
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
