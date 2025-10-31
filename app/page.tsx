import { HeroSection } from '@/components/landing/HeroSection'
import { CoreFlowsSection } from '@/components/landing/CoreFlowsSection'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import { MapPreviewSection } from '@/components/landing/MapPreviewSection'
import { TrustSection } from '@/components/landing/TrustSection'
import { LandingCta } from '@/components/landing/LandingCta'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-aura-cream text-aura-navy">
      <HeroSection />
      <CoreFlowsSection />
      <FeaturedSalesSection />
      <MapPreviewSection />
      <TrustSection />
      <LandingCta />
    </main>
  )
}
