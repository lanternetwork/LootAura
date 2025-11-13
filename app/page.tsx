import { Suspense } from 'react'
import { Metadata } from 'next'
import { TopNav } from '@/components/landing/TopNav'
import { Hero } from '@/components/landing/Hero'
import { CoreFlowsSection } from '@/components/landing/CoreFlowsSection'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import { MapPreviewSection } from '@/components/landing/MapPreviewSection'
import { LandingCta } from '@/components/landing/LandingCta'
import { createPageMetadata } from '@/lib/metadata'

export const metadata: Metadata = createPageMetadata({
  title: 'LootAura · Yard Sales Near You',
  description: 'Find and post yard sales, garage sales, and estate sales in your area. Never miss a great deal again!',
  path: '/',
})

export default function Home() {

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
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
