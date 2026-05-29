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
import { getSeoRolloutStateForRequest } from '@/lib/seo/loadSeoRolloutState'
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
    const rolloutState = await getSeoRolloutStateForRequest()
    if (!resolveSeoSitemapPlan(0, rolloutState).indexingEnabled) {
      return [{ id: 'static' }]
    }
    const rows = await fetchPublishedListingRowsForSitemap()
    const plan = resolveSeoSitemapPlan(rows.length, rolloutState)
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
    const { metros, inventoryBySlug } = await loadNationwideMetroSnapshotForSitemap()
    if (id === 'cities') {
      return buildCitySitemapEntries({
        metros,
        nationalIndexingAllowed: true,
        inventoryBySlug,
      })
    }
    return buildWeekendSitemapEntries({
      metros,
      nationalIndexingAllowed: true,
      inventoryBySlug,
    })
  }

  const chunkIndex = parseListingSitemapChunkId(id)
  if (chunkIndex != null) {
    const rows = await fetchPublishedListingRowsForSitemap()
    return buildListingSitemapEntriesForChunk(rows, chunkIndex)
  }

  return []
}
