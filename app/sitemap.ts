import type { MetadataRoute } from 'next'
import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import {
  buildListingSitemapEntriesForChunk,
  parseListingSitemapChunkId,
} from '@/lib/seo/sitemap/listingEntries'
import { fetchPublishedListingRowsForSitemap } from '@/lib/seo/sitemap/fetchPublishedListingRows'
import { buildCitySitemapEntries } from '@/lib/seo/sitemap/cityEntries'
import { buildWeekendSitemapEntries } from '@/lib/seo/sitemap/weekendEntries'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import { isSeoIndexRolloutEnvReady } from '@/lib/seo/indexRollout'
import { emptyInventoryByPilotSlug } from '@/lib/seo/buildSeoOperationalSnapshot'

export async function generateSitemaps() {
  if (!isSeoIndexRolloutEnvReady()) {
    return [{ id: 'static' }]
  }
  const rows = await fetchPublishedListingRowsForSitemap()
  const plan = resolveSeoSitemapPlan(rows.length)
  return plan.segmentIds.map((segmentId) => ({ id: segmentId }))
}

export default async function sitemap({
  id,
}: {
  id: string
}): Promise<MetadataRoute.Sitemap> {
  if (id === 'static') {
    return buildStaticSitemapEntries()
  }

  if (id === 'cities') {
    return buildCitySitemapEntries({
      nationalIndexingAllowed: true,
      inventoryBySlug: emptyInventoryByPilotSlug(),
    })
  }

  if (id === 'weekends') {
    return buildWeekendSitemapEntries({
      nationalIndexingAllowed: true,
      inventoryBySlug: emptyInventoryByPilotSlug(),
    })
  }

  const chunkIndex = parseListingSitemapChunkId(id)
  if (chunkIndex != null) {
    const rows = await fetchPublishedListingRowsForSitemap()
    return buildListingSitemapEntriesForChunk(rows, chunkIndex)
  }

  return []
}
