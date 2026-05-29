import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import { buildCitySitemapEntries } from '@/lib/seo/sitemap/cityEntries'
import { buildWeekendSitemapEntries } from '@/lib/seo/sitemap/weekendEntries'
import { countListingSitemapChunks } from '@/lib/seo/sitemap/listingEntries'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import type { SeoSitemapCounts } from '@/lib/seo/buildSeoOperationalSnapshot'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'
import { SEO_ROLLOUT_DISABLED_STATE } from '@/lib/seo/seoRolloutTypes'

export function computeSeoSitemapCounts(options: {
  totalPublishedListings: number
  nationalIndexingAllowed: boolean
  metros?: SeoMetro[]
  inventoryBySlug?: Record<string, SeoInventorySummary>
  rolloutState?: SeoRolloutRuntimeState
}): SeoSitemapCounts {
  const rolloutState = options.rolloutState ?? SEO_ROLLOUT_DISABLED_STATE
  const plan = resolveSeoSitemapPlan(options.totalPublishedListings, rolloutState)
  const metros = options.metros ?? []
  const inventoryBySlug = options.inventoryBySlug ?? {}
  const cityEntries = buildCitySitemapEntries({
    metros,
    nationalIndexingAllowed: options.nationalIndexingAllowed,
    inventoryBySlug,
  })
  const weekendEntries = buildWeekendSitemapEntries({
    metros,
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
