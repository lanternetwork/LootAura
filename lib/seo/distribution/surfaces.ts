import type { SeoDistributionSurfaceId } from '@/lib/seo/distribution/types'

export type SeoDistributionSurfaceDef = {
  id: SeoDistributionSurfaceId
  label: string
  /** Soft guidance for operators pasting into channels. */
  recommendedMaxChars: number
}

export const SEO_DISTRIBUTION_SURFACES: SeoDistributionSurfaceDef[] = [
  { id: 'reddit_city', label: 'Reddit — city inventory', recommendedMaxChars: 4000 },
  { id: 'reddit_weekend', label: 'Reddit — this weekend', recommendedMaxChars: 4000 },
  { id: 'facebook_city', label: 'Facebook group — city', recommendedMaxChars: 5000 },
  { id: 'facebook_weekend', label: 'Facebook group — weekend', recommendedMaxChars: 5000 },
  { id: 'digest_email', label: 'Weekly digest (email)', recommendedMaxChars: 10000 },
]

export function getDistributionSurface(id: string): SeoDistributionSurfaceDef | undefined {
  return SEO_DISTRIBUTION_SURFACES.find((s) => s.id === id)
}

export function isWeekendDistributionSurface(surface: SeoDistributionSurfaceId): boolean {
  return surface === 'reddit_weekend' || surface === 'facebook_weekend'
}
