import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import { buildCitySitemapEntries } from '@/lib/seo/sitemap/cityEntries'
import { buildWeekendSitemapEntries } from '@/lib/seo/sitemap/weekendEntries'
import { countListingSitemapChunks } from '@/lib/seo/sitemap/listingEntries'
import type { SeoSitemapCounts } from '@/lib/seo/buildSeoOperationalSnapshot'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'

export function computeSeoSitemapCounts(options: {
  totalPublishedListings: number
  listingIndexingAllowed: boolean
  geoIndexingAllowed: boolean
  metros?: SeoMetro[]
  inventoryBySlug?: Record<string, SeoInventorySummary>
  /** @deprecated use listingIndexingAllowed + geoIndexingAllowed */
  inventoryIndexingAllowed?: boolean
}): SeoSitemapCounts {
  const listingAllowed =
    options.listingIndexingAllowed ?? options.inventoryIndexingAllowed ?? false
  const geoAllowed = options.geoIndexingAllowed ?? options.inventoryIndexingAllowed ?? false
  const metros = options.metros ?? []
  const inventoryBySlug = options.inventoryBySlug ?? {}
  const cityEntries = buildCitySitemapEntries({
    metros,
    nationalIndexingAllowed: geoAllowed,
    inventoryBySlug,
  })
  const weekendEntries = buildWeekendSitemapEntries({
    metros,
    nationalIndexingAllowed: geoAllowed,
    inventoryBySlug,
  })

  const listingChunkCount =
    listingAllowed && options.totalPublishedListings > 0
      ? countListingSitemapChunks(options.totalPublishedListings)
      : 0

  return {
    staticUrlCount: buildStaticSitemapEntries().length,
    listingChunkCount,
    listingUrlCount: listingAllowed ? options.totalPublishedListings : 0,
    cityUrlCount: geoAllowed ? cityEntries.length : 0,
    weekendUrlCount: geoAllowed ? weekendEntries.length : 0,
  }
}

export { countListingSitemapChunks }
