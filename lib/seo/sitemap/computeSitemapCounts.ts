import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import { buildCitySitemapEntries } from '@/lib/seo/sitemap/cityEntries'
import { buildWeekendSitemapEntries } from '@/lib/seo/sitemap/weekendEntries'
import { countListingSitemapChunks } from '@/lib/seo/sitemap/listingEntries'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import type { SeoSitemapCounts } from '@/lib/seo/buildSeoOperationalSnapshot'
import type { SeoInventorySummary } from '@/lib/seo/types'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutState'
import { SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutState'

export function computeSeoSitemapCounts(options: {
  totalPublishedListings: number
  nationalIndexingAllowed: boolean
  inventoryBySlug?: Record<string, SeoInventorySummary>
  rolloutState?: SeoRolloutRuntimeState
}): SeoSitemapCounts {
  const rolloutState = options.rolloutState ?? SEO_ROLLOUT_DISABLED_STATE
  const plan = resolveSeoSitemapPlan(options.totalPublishedListings, rolloutState)
  const inventoryBySlug = options.inventoryBySlug ?? {}
  const cityEntries = buildCitySitemapEntries({
    nationalIndexingAllowed: options.nationalIndexingAllowed,
    inventoryBySlug,
  })
  const weekendEntries = buildWeekendSitemapEntries({
    nationalIndexingAllowed: options.nationalIndexingAllowed,
    inventoryBySlug,
  })

  return {
    staticUrlCount: buildStaticSitemapEntries().length,
    listingChunkCount: plan.listingChunkCount,
    listingUrlCount: plan.indexingEnabled ? options.totalPublishedListings : 0,
    cityUrlCount: cityEntries.length,
    weekendUrlCount: weekendEntries.length,
  }
}

export { countListingSitemapChunks }
