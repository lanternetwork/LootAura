import { Metadata } from 'next'
import SalesClient from '../../sales/SalesClient'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cookies, headers } from 'next/headers'
import { createPageMetadata } from '@/lib/metadata'
import { computeSSRInitialSales } from '@/lib/map/ssrInitialSales'
import { type Bounds } from '@/lib/map/bounds'
import { type Sale } from '@/lib/types'

interface SalesPageProps {
  searchParams: {
    lat?: string
    lng?: string
    zoom?: string
    zip?: string
    distanceKm?: string
    city?: string
    categories?: string
    dateFrom?: string
    dateTo?: string
    page?: string
    pageSize?: string
  }
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = createPageMetadata({
  title: 'Find Yard Sales',
  description: 'Browse yard sales, garage sales, and estate sales on an interactive map. Find great deals near you.',
  path: '/app/sales',
})

export default async function AppSalesPage({ searchParams }: SalesPageProps) {
  const supabase = createSupabaseServerClient()
  let user: any = null
  try {
    const res = await supabase.auth.getUser()
    user = res.data.user
  } catch {
    user = null
  }

  // Parse search parameters (for future use)
  const _lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const _lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined
  const _zip = searchParams.zip
  const _distanceKm = searchParams.distanceKm ? parseFloat(searchParams.distanceKm) : 25
  const _city = searchParams.city
  const _categories = searchParams.categories ? searchParams.categories.split(',') : undefined
  const _pageSize = searchParams.pageSize ? parseInt(searchParams.pageSize) : 50

  // Resolve initial center server-side
  const cookieStore = cookies()
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || ''
  const protocol = (headersList.get('x-forwarded-proto') || 'https') + '://'
  // Use fallback if host is empty (matching pattern from app/sell/new/page.tsx)
  const baseUrl: string = host ? `${protocol}${host}` : 
    (process.env.NEXT_PUBLIC_SITE_URL || 
     (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'))
  
  // Check if this is a mobile request (best-effort detection via user agent)
  // Note: Client-side will have accurate viewport width, but server-side we can only guess
  // On mobile, we want GPS-first on cold start, so reduce server-side overrides
  const userAgent = headersList.get('user-agent') || ''
  const isMobileRequest = /Mobile|Android|iPhone|iPad/i.test(userAgent)

  let initialCenter: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } } | null = null

  // 0) URL parameters (highest priority)
  if (_lat && _lng) {
    initialCenter = { lat: _lat, lng: _lng }
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[APP_SALES_PAGE] Using URL parameters:`, initialCenter)
    }
  }
  
  // 0.5) ZIP code or city name lookup (only if no lat/lng in URL)
  if (!initialCenter && _zip && baseUrl) {
    try {
      // First, try ZIP code lookup
      const zipRes = await fetch(`${baseUrl}/api/geocoding/zip?zip=${encodeURIComponent(_zip)}`, { cache: 'no-store' })
      if (zipRes.ok) {
        const zipData = await zipRes.json()
        if (zipData?.ok && zipData.lat && zipData.lng) {
          initialCenter = { 
            lat: zipData.lat, 
            lng: zipData.lng, 
            label: { zip: zipData.zip, city: zipData.city, state: zipData.state } 
          }
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log(`[APP_SALES_PAGE] Using ZIP lookup from URL:`, initialCenter)
          }
        }
      }
      
      // If ZIP lookup failed, try city name geocoding
      if (!initialCenter) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[APP_SALES_PAGE] ZIP lookup failed, trying city name geocoding for:`, _zip)
        }
        const suggestRes = await fetch(`${baseUrl}/api/geocoding/suggest?q=${encodeURIComponent(_zip)}&limit=1`, { cache: 'no-store' })
        if (suggestRes.ok) {
          const suggestData = await suggestRes.json()
          if (suggestData?.ok && suggestData.data && suggestData.data.length > 0) {
            const firstResult = suggestData.data[0]
            if (firstResult.lat && firstResult.lng) {
              initialCenter = {
                lat: firstResult.lat,
                lng: firstResult.lng,
                label: {
                  city: firstResult.address?.city || firstResult.address?.town || firstResult.address?.village,
                  state: firstResult.address?.state,
                  zip: firstResult.address?.postcode || firstResult.address?.zip
                }
              }
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.log(`[APP_SALES_PAGE] Using city name geocoding from URL:`, initialCenter)
              }
            }
          }
        }
      }
    } catch (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error(`[APP_SALES_PAGE] ZIP/city lookup error:`, error)
      }
    }
  }

  // 1) la_loc cookie (only if no URL params, and not mobile cold start)
  // On mobile cold start, we want GPS-first, so skip cookie
  // Cookie is still useful for desktop and mobile navigation (non-cold-start)
  if (!initialCenter && !isMobileRequest) {
    try {
      const c = cookieStore.get('la_loc')?.value
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[APP_SALES_PAGE] la_loc cookie:`, c)
      }
      if (c) {
        const parsed = JSON.parse(c)
        if (parsed?.lat && parsed?.lng) {
          initialCenter = {
            lat: Number(parsed.lat),
            lng: Number(parsed.lng),
            label: { zip: parsed.zip, city: parsed.city, state: parsed.state }
          }
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log(`[APP_SALES_PAGE] Using cookie location:`, initialCenter)
          }
        }
      }
    } catch (e) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[APP_SALES_PAGE] Cookie parse error:`, e)
      }
    }
  }

  // 2) user profile.home_zip → lookup zip (only if not mobile cold start)
  // On mobile cold start, we want GPS-first, so skip profile home_zip
  if (!initialCenter && user && !isMobileRequest) {
    try {
      // Try profiles_v2 view first
      const { data: profile } = await supabase
        .from('profiles_v2')
        .select('home_zip')
        .eq('id', user.id)
        .maybeSingle()

      const homeZip: string | undefined = profile?.home_zip || undefined
      if (homeZip && baseUrl) {
        const zipRes = await fetch(`${baseUrl}/api/geocoding/zip?zip=${encodeURIComponent(homeZip)}`, { cache: 'no-store' })
        if (zipRes.ok) {
          const z = await zipRes.json()
          if (z?.ok && z.lat && z.lng) {
            initialCenter = { lat: z.lat, lng: z.lng, label: { zip: z.zip, city: z.city, state: z.state } }
          }
        }
      }
    } catch {}
  }

  // 3) IP geolocation - try direct approach first, then API
  // On mobile cold start, IP is fallback after GPS fails
  // On desktop or non-cold-start, IP is normal fallback
  if (!initialCenter) {
    try {
      // Try Vercel headers directly first
      const vercelLat = headersList.get('x-vercel-ip-latitude')
      const vercelLng = headersList.get('x-vercel-ip-longitude')
      const vercelCity = headersList.get('x-vercel-ip-city')
      const vercelState = headersList.get('x-vercel-ip-region')
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[APP_SALES_PAGE] Vercel headers:`, { vercelLat, vercelLng, vercelCity, vercelState })
      }
      
      if (vercelLat && vercelLng) {
        initialCenter = { 
          lat: Number(vercelLat), 
          lng: Number(vercelLng), 
          label: { city: vercelCity || undefined, state: vercelState || undefined } 
        }
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[APP_SALES_PAGE] Using Vercel location:`, initialCenter)
        }
      } else if (baseUrl) {
        // Fallback to API
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[APP_SALES_PAGE] Trying IP geolocation API: ${baseUrl}/api/geolocation/ip`)
        }
        const ipRes = await fetch(`${baseUrl}/api/geolocation/ip`, { cache: 'no-store' })
        if (ipRes.ok) {
          const g = await ipRes.json()
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log(`[APP_SALES_PAGE] IP geolocation response:`, g)
          }
          if (g?.lat && g?.lng) {
            initialCenter = { lat: Number(g.lat), lng: Number(g.lng), label: { city: g.city, state: g.state } }
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log(`[APP_SALES_PAGE] Using IP location:`, initialCenter)
            }
          }
        } else {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log(`[APP_SALES_PAGE] IP geolocation failed:`, ipRes.status)
          }
        }
      }
    } catch (e) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[APP_SALES_PAGE] IP geolocation error:`, e)
      }
    }
  }

  // 4) Neutral fallback if still missing
  if (!initialCenter) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[APP_SALES_PAGE] Using neutral US center fallback`)
    }
    initialCenter = { lat: 39.8283, lng: -98.5795 }
  } else {
    // Set/refresh la_loc cookie for 24h when we have a real center
    try {
      const val = JSON.stringify({
        lat: initialCenter.lat,
        lng: initialCenter.lng,
        zip: initialCenter.label?.zip,
        city: initialCenter.label?.city,
        state: initialCenter.label?.state,
      })
      cookieStore.set('la_loc', val, { httpOnly: false, maxAge: 60 * 60 * 24, sameSite: 'lax', path: '/' })
    } catch {}
  }

  // Compute initial sales and buffered bounds server-side (matching client's first fetch)
  // Only seed if we have a valid center (skip if ZIP needs client-side resolution)
  const urlZoom = searchParams.zoom
  const urlZip = searchParams.zip
  const zipNeedsResolution = urlZip && !_lat && !_lng && 
    (!initialCenter || !initialCenter.label?.zip || initialCenter.label.zip !== urlZip.trim())
  
  let initialSales: Sale[] = []
  let initialBufferedBounds: Bounds | null = null
  
  // Only compute SSR data if we have a valid center and ZIP doesn't need resolution
  if (initialCenter && !zipNeedsResolution) {
    try {
      // Parse filters from URL (matching client's useFilters initialization)
      const dateRange = searchParams.dateFrom || searchParams.dateTo ? 'range' : 'any'
      const categories = _categories || []
      const distance = _distanceKm ? _distanceKm / 1.60934 : 10 // Convert km to miles, default 10
      
      const result = await computeSSRInitialSales(
        { lat: initialCenter.lat, lng: initialCenter.lng },
        baseUrl,
        urlZoom,
        {
          dateRange,
          categories,
          distance
        }
      )
      
      initialSales = result.initialSales
      initialBufferedBounds = result.initialBufferedBounds
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[APP_SALES_PAGE] SSR initial data:`, {
          salesCount: initialSales.length,
          bufferedBounds: initialBufferedBounds
        })
      }
    } catch (error) {
      // On error, fall back to empty (client will fetch)
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error(`[APP_SALES_PAGE] SSR initial sales error:`, error)
      }
      initialSales = []
      initialBufferedBounds = null
    }
  }

  return (
    <div className="bg-gray-50 overflow-hidden" style={{ height: '100vh', marginTop: '-56px', paddingTop: '56px' }}>
      <SalesClient 
        initialSales={initialSales}
        initialBufferedBounds={initialBufferedBounds}
        initialCenter={initialCenter}
        user={user}
      />
    </div>
  )
}
