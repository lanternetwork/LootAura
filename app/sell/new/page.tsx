import { Suspense } from 'react'
import { headers } from 'next/headers'
import SellWizardClient from './SellWizardClient'

// Force dynamic rendering to ensure promotionsEnabled is always re-evaluated after OAuth
export const dynamic = 'force-dynamic'

export default async function SellNewPage() {
  // Get user location server-side (same pattern as sales page)
  let userLat: number | undefined
  let userLng: number | undefined
  
  try {
    const headersList = await headers()
    // Try Vercel headers directly first (faster, no API call)
    const vercelLat = headersList.get('x-vercel-ip-latitude')
    const vercelLng = headersList.get('x-vercel-ip-longitude')
    
    if (vercelLat && vercelLng) {
      userLat = Number(vercelLat)
      userLng = Number(vercelLng)
    } else {
      // Fallback to IP geolocation API
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const ipRes = await fetch(`${baseUrl}/api/geolocation/ip`, { cache: 'no-store' })
      if (ipRes.ok) {
        const g = await ipRes.json()
        if (g?.lat && g?.lng) {
          userLat = Number(g.lat)
          userLng = Number(g.lng)
        }
      }
    }
  } catch (e) {
    // Location fetch failed - continue without it
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.warn('[SellNewPage] Failed to get location:', e)
    }
  }

  const promotionsEnabled = process.env.PROMOTIONS_ENABLED === 'true'
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true'

  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[SELL_NEW_PAGE] Rendering with flags:', { promotionsEnabled, paymentsEnabled })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<SellWizardSkeleton />}>
        <SellWizardClient
          userLat={userLat}
          userLng={userLng}
          promotionsEnabled={promotionsEnabled}
          paymentsEnabled={paymentsEnabled}
        />
      </Suspense>
    </div>
  )
}

function SellWizardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        {/* Header skeleton */}
        <div className="text-center space-y-4">
          <div className="h-8 bg-gray-200 rounded-lg animate-pulse w-1/3 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded-lg animate-pulse w-1/2 mx-auto"></div>
        </div>
        
        {/* Progress skeleton */}
        <div className="flex justify-center">
          <div className="flex space-x-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
            ))}
          </div>
        </div>
        
        {/* Form skeleton */}
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/4"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
