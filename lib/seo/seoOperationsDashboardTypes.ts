import type { CrawlSmokeReport } from '@/lib/seo/crawlSmoke'
import type { SeoOperationalSnapshot } from '@/lib/seo/buildSeoOperationalSnapshot'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'

export type SeoHealthState = 'READY' | 'ACTION_REQUIRED' | 'BLOCKED'

export type SeoHealthBlocker = {
  source: 'ingestion' | 'rollout' | 'metro'
  text: string
}

export type SeoCanonicalSummary = {
  configuredEnv: string | null
  effectiveCanonical: string
  usingFallback: boolean
  fallbackUrl: string
}

export type SeoIndexabilitySummary = {
  listings: 'INDEX' | 'NOINDEX'
  qualifiedMetroCount: number
  blockedMetroCount: number
  totalMetroCount: number
  defaultDirective: string
}

export type SeoListingFootprint = {
  published: number
  indexable: number
  noindex: number
}

export type SeoSitemapDiagnostics = {
  sitemapUrl: string
  indexingEnabled: boolean
  segments: string[]
  staticUrlCount: number
  listingUrlCount: number
  cityUrlCount: number
  weekendUrlCount: number
}

export type SeoInternalLinkSample = {
  sampleSize: number
  listingsWithCityLink: number
  listingsWithWeekendLink: number
  nearbySaleLinks: number
  nearbySampleSize: number
  label: string
}

export type SeoOperationsDashboard = {
  generatedAt: string
  health: SeoHealthState
  blockers: SeoHealthBlocker[]
  rolloutState: SeoRolloutRuntimeState
  canonical: SeoCanonicalSummary
  indexability: SeoIndexabilitySummary
  listingFootprint: SeoListingFootprint
  sitemap: SeoSitemapDiagnostics
  internalLinks: SeoInternalLinkSample
  snapshot: SeoOperationalSnapshot
  crawlSmoke: CrawlSmokeReport | null
}
