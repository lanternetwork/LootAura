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
import { getInventorySeoEmissionForRequest } from '@/lib/seo/resolveInventorySeoEmission'
import { fetchNationwideSeoMetroInventory } from '@/lib/seo/fetchAllSeoMetroInventory'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'

export const dynamic = 'force-dynamic'

async function loadNationwideMetroSnapshotForSitemap(): Promise<{
  metros: SeoMetro[]
  inventoryBySlug: Record<string, SeoInventorySummary>
}> {
  try {
    return await fetchNationwideSeoMetroInventory()
  } catch {
    return { metros: [], inventoryBySlug: {} }
  }
}

export async function generateSitemaps() {
  try {
    const emission = await getInventorySeoEmissionForRequest()
    if (!resolveSeoSitemapPlan(0, emission.indexingAllowed).indexingEnabled) {
      return [{ id: 'static' }]
    }
    const rows = await fetchPublishedListingRowsForSitemap()
    const plan = resolveSeoSitemapPlan(rows.length, emission.indexingAllowed)
    return plan.segmentIds.map((segmentId) => ({ id: segmentId }))
  } catch {
    return [{ id: 'static' }]
  }
}

export default async function sitemap({
  id,
}: {
  id: string
}): Promise<MetadataRoute.Sitemap> {
  if (id === 'static') {
    return buildStaticSitemapEntries()
  }

  if (id === 'cities' || id === 'weekends') {
    const emission = await getInventorySeoEmissionForRequest()
    const { metros, inventoryBySlug } = await loadNationwideMetroSnapshotForSitemap()
    if (id === 'cities') {
      return buildCitySitemapEntries({
        metros,
        nationalIndexingAllowed: emission.indexingAllowed,
        inventoryBySlug,
      })
    }
    return buildWeekendSitemapEntries({
      metros,
      nationalIndexingAllowed: emission.indexingAllowed,
      inventoryBySlug,
    })
  }

  const chunkIndex = parseListingSitemapChunkId(id)
  if (chunkIndex != null) {
    const emission = await getInventorySeoEmissionForRequest()
    if (!emission.indexingAllowed) {
      return []
    }
    const rows = await fetchPublishedListingRowsForSitemap()
    return buildListingSitemapEntriesForChunk(rows, chunkIndex)
  }

  return []
}
