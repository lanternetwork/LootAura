import { Metadata } from 'next'
import SalesClient from './SalesClient'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cookies, headers } from 'next/headers'
import { createPageMetadata } from '@/lib/metadata'

interface SalesPageProps {
  searchParams: {
    lat?: string
    lng?: string
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
  path: '/sales',
})

export default async function SalesPage({ searchParams }: SalesPageProps) {
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
  const baseUrl = host ? `${protocol}${host}` : ''

  let initialCenter: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } } | null = null

  // 0) URL parameters (highest priority)
  if (_lat && _lng) {
    initialCenter = { lat: _lat, lng: _lng }
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[SALES_PAGE] Using URL parameters:`, initialCenter)
    }
  }
  
  // 0.5) ZIP code lookup (only if no lat/lng in URL)
  if (!initialCenter && _zip && baseUrl) {
    try {
      const zipRes = await Promise.race([
        fetch(`${baseUrl}/api/geocoding/zip?zip=${encodeURIComponent(_zip)}`, { cache: 'no-store' }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ])
      if (zipRes.ok) {
        const zipData = await zipRes.json()
        if (zipData?.ok && zipData.lat && zipData.lng) {
          initialCenter = { 
            lat: zipData.lat, 
            lng: zipData.lng, 
            label: { zip: zipData.zip, city: zipData.city, state: zipData.state } 
          }
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log(`[SALES_PAGE] Using ZIP lookup from URL:`, initialCenter)
          }
        }
      }
    } catch (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error(`[SALES_PAGE] ZIP lookup error:`, error)
      }
    }
  }

  // 1) la_loc cookie (only if no URL params)
  if (!initialCenter) {
    try {
      const c = cookieStore.get('la_loc')?.value
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[SALES_PAGE] la_loc cookie:`, c)
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
            console.log(`[SALES_PAGE] Using cookie location:`, initialCenter)
          }
        }
      }
    } catch (e) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[SALES_PAGE] Cookie parse error:`, e)
      }
    }
  }

  // 2) user profile.home_zip → lookup zip
  if (!initialCenter && user) {
    try {
      // Try profiles_v2 view first with timeout
      const profilePromise = supabase
        .from('profiles_v2')
        .select('home_zip')
        .eq('id', user.id)
        .maybeSingle()
      
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
      
      const profile = await Promise.race([profilePromise, timeoutPromise])
      const profileData = profile && 'data' in profile ? profile.data : null

      const homeZip: string | undefined = profileData?.home_zip || undefined
      if (homeZip && baseUrl) {
        try {
          const zipRes = await Promise.race([
            fetch(`${baseUrl}/api/geocoding/zip?zip=${encodeURIComponent(homeZip)}`, { cache: 'no-store' }),
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
          ])
          if (zipRes.ok) {
            const z = await zipRes.json()
            if (z?.ok && z.lat && z.lng) {
              initialCenter = { lat: z.lat, lng: z.lng, label: { zip: z.zip, city: z.city, state: z.state } }
            }
          }
        } catch {
          // Silently fail - will fall back to IP geolocation or default
        }
      }
    } catch {
      // Silently fail - will fall back to IP geolocation or default
    }
  }

  // 3) IP geolocation - try direct approach first, then API
  if (!initialCenter) {
    try {
      // Try Vercel headers directly first
      const vercelLat = headersList.get('x-vercel-ip-latitude')
      const vercelLng = headersList.get('x-vercel-ip-longitude')
      const vercelCity = headersList.get('x-vercel-ip-city')
      const vercelState = headersList.get('x-vercel-ip-region')
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[SALES_PAGE] Vercel headers:`, { vercelLat, vercelLng, vercelCity, vercelState })
      }
      
      if (vercelLat && vercelLng) {
        initialCenter = { 
          lat: Number(vercelLat), 
          lng: Number(vercelLng), 
          label: { city: vercelCity || undefined, state: vercelState || undefined } 
        }
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[SALES_PAGE] Using Vercel location:`, initialCenter)
        }
      } else if (baseUrl) {
        // Fallback to API with timeout
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log(`[SALES_PAGE] Trying IP geolocation API: ${baseUrl}/api/geolocation/ip`)
        }
        try {
          const ipRes = await Promise.race([
            fetch(`${baseUrl}/api/geolocation/ip`, { cache: 'no-store' }),
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
          ])
          if (ipRes.ok) {
            const g = await ipRes.json()
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log(`[SALES_PAGE] IP geolocation response:`, g)
            }
            if (g?.lat && g?.lng) {
              initialCenter = { lat: Number(g.lat), lng: Number(g.lng), label: { city: g.city, state: g.state } }
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.log(`[SALES_PAGE] Using IP location:`, initialCenter)
              }
            }
          } else {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log(`[SALES_PAGE] IP geolocation failed:`, ipRes.status)
            }
          }
        } catch {
          // Silently fail - will use default center
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log(`[SALES_PAGE] IP geolocation timeout or error`)
          }
        }
      }
    } catch (e) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[SALES_PAGE] IP geolocation error:`, e)
      }
    }
  }

  // 4) Neutral fallback if still missing
  if (!initialCenter) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[SALES_PAGE] Using neutral US center fallback`)
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

  // Start with empty sales; client fetches immediately using initialCenter
  const initialSales: any[] = []

  return (
    <div className="bg-gray-50 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <SalesClient 
        initialSales={initialSales}
        initialCenter={initialCenter}
        user={user}
      />
    </div>
  )
}

function _SalesSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        {/* Search bar skeleton */}
        <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
        
        {/* Filters skeleton */}
        <div className="flex gap-4">
          <div className="h-10 bg-gray-200 rounded-lg animate-pulse w-24"></div>
          <div className="h-10 bg-gray-200 rounded-lg animate-pulse w-24"></div>
          <div className="h-10 bg-gray-200 rounded-lg animate-pulse w-24"></div>
        </div>
        
        {/* Sales grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm p-4 space-y-3">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

