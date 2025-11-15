import { Suspense } from 'react'
import { Metadata } from 'next'
import { Hero } from '@/components/landing/Hero'
import { CoreFlowsSection } from '@/components/landing/CoreFlowsSection'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import { MapPreviewSection } from '@/components/landing/MapPreviewSection'
import { LandingCta } from '@/components/landing/LandingCta'
import { createPageMetadata } from '@/lib/metadata'
import { AuthStateRefresher } from '@/components/auth/AuthStateRefresher'

export const metadata: Metadata = createPageMetadata({
  title: 'LootAura · Yard Sales Near You',
  description: 'Find and post yard sales, garage sales, and estate sales in your area. Never miss a great deal again!',
  path: '/',
})

export default function Home() {

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthStateRefresher />
      <Hero />
      <CoreFlowsSection />
      <Suspense fallback={<div className="py-12 bg-gray-50" />}>
        <FeaturedSalesSection />
      </Suspense>
      <MapPreviewSection />
      <LandingCta />
    </div>
  )
}
