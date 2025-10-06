import { Suspense } from 'react'
import SalesClient from './SalesClient'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cookies, headers } from 'next/headers'

interface SalesPageProps {
  searchParams: {
    lat?: string
    lng?: string
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

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const supabase = createSupabaseServerClient()
  let user: any = null
  try {
    const res = await supabase.auth.getUser()
    user = res.data.user
  } catch {
    user = null
  }

  // Parse search parameters
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined
  const distanceKm = searchParams.distanceKm ? parseFloat(searchParams.distanceKm) : 25
  const city = searchParams.city
  const categories = searchParams.categories ? searchParams.categories.split(',') : undefined
  const pageSize = searchParams.pageSize ? parseInt(searchParams.pageSize) : 50

  // Resolve initial center server-side
  const cookieStore = cookies()
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || ''
  const protocol = (headersList.get('x-forwarded-proto') || 'https') + '://'
  const baseUrl = host ? `${protocol}${host}` : ''

  let initialCenter: { lat: number; lng: number; label?: { zip?: string; city?: string; state?: string } } | null = null

  // 1) la_loc cookie
  try {
    const c = cookieStore.get('la_loc')?.value
    console.log(`[SALES_PAGE] la_loc cookie:`, c)
    if (c) {
      const parsed = JSON.parse(c)
      if (parsed?.lat && parsed?.lng) {
        initialCenter = {
          lat: Number(parsed.lat),
          lng: Number(parsed.lng),
          label: { zip: parsed.zip, city: parsed.city, state: parsed.state }
        }
        console.log(`[SALES_PAGE] Using cookie location:`, initialCenter)
      }
    }
  } catch (e) {
    console.log(`[SALES_PAGE] Cookie parse error:`, e)
  }

  // 2) user profile.home_zip → lookup zip
  if (!initialCenter && user) {
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
  if (!initialCenter) {
    try {
      // Try Vercel headers directly first
      const vercelLat = headersList.get('x-vercel-ip-latitude')
      const vercelLng = headersList.get('x-vercel-ip-longitude')
      const vercelCity = headersList.get('x-vercel-ip-city')
      const vercelState = headersList.get('x-vercel-ip-region')
      
      console.log(`[SALES_PAGE] Vercel headers:`, { vercelLat, vercelLng, vercelCity, vercelState })
      
      if (vercelLat && vercelLng) {
        initialCenter = { 
          lat: Number(vercelLat), 
          lng: Number(vercelLng), 
          label: { city: vercelCity, state: vercelState } 
        }
        console.log(`[SALES_PAGE] Using Vercel location:`, initialCenter)
      } else if (baseUrl) {
        // Fallback to API
        console.log(`[SALES_PAGE] Trying IP geolocation API: ${baseUrl}/api/geolocation/ip`)
        const ipRes = await fetch(`${baseUrl}/api/geolocation/ip`, { cache: 'no-store' })
        if (ipRes.ok) {
          const g = await ipRes.json()
          console.log(`[SALES_PAGE] IP geolocation response:`, g)
          if (g?.lat && g?.lng) {
            initialCenter = { lat: Number(g.lat), lng: Number(g.lng), label: { city: g.city, state: g.state } }
            console.log(`[SALES_PAGE] Using IP location:`, initialCenter)
          }
        } else {
          console.log(`[SALES_PAGE] IP geolocation failed:`, ipRes.status)
        }
      }
    } catch (e) {
      console.log(`[SALES_PAGE] IP geolocation error:`, e)
    }
  }

  // 4) Neutral fallback if still missing
  if (!initialCenter) {
    console.log(`[SALES_PAGE] Using neutral fallback location`)
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
  let initialSales: any[] = []

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<SalesSkeleton />}>
        <SalesClient 
          initialSales={initialSales}
          initialSearchParams={searchParams}
          initialCenter={initialCenter}
          user={user}
        />
      </Suspense>
    </div>
  )
}

function SalesSkeleton() {
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

