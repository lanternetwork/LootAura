import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import { buildCitySitemapEntries } from '@/lib/seo/sitemap/cityEntries'
import { buildWeekendSitemapEntries } from '@/lib/seo/sitemap/weekendEntries'
import { countListingSitemapChunks } from '@/lib/seo/sitemap/listingEntries'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import type { SeoSitemapCounts } from '@/lib/seo/buildSeoOperationalSnapshot'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'
export function computeSeoSitemapCounts(options: {
  totalPublishedListings: number
  inventoryIndexingAllowed: boolean
  metros?: SeoMetro[]
  inventoryBySlug?: Record<string, SeoInventorySummary>
}): SeoSitemapCounts {
  const plan = resolveSeoSitemapPlan(
    options.totalPublishedListings,
    options.inventoryIndexingAllowed
  )
  const metros = options.metros ?? []
  const inventoryBySlug = options.inventoryBySlug ?? {}
  const cityEntries = buildCitySitemapEntries({
    metros,
    nationalIndexingAllowed: options.inventoryIndexingAllowed,
    inventoryBySlug,
  })
  const weekendEntries = buildWeekendSitemapEntries({
    metros,
    nationalIndexingAllowed: options.inventoryIndexingAllowed,
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
