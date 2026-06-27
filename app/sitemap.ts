import type { MetadataRoute } from 'next'
import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import {
  buildListingSitemapEntriesForChunk,
  countListingSitemapChunks,
  listingSitemapChunkId,
  parseListingSitemapChunkId,
} from '@/lib/seo/sitemap/listingEntries'
import { buildCitySitemapEntriesFromQualifiedSlugs } from '@/lib/seo/sitemap/cityEntries'
import { buildWeekendSitemapEntriesFromQualifiedSlugs } from '@/lib/seo/sitemap/weekendEntries'
import { resolveSitemapSeoGate } from '@/lib/seo/resolveSitemapSeoGate'
import { loadGeoSitemapMetroSlugs } from '@/lib/seo/snapshots/loadGeoSitemapMetroSlugs'
import {
  countSeoSitemapInventory,
  loadSeoSitemapInventoryChunk,
} from '@/lib/seo/snapshots/loadSeoSitemapInventory'
import { getAdminDb } from '@/lib/supabase/clients'

export const revalidate = 3600

export async function generateSitemaps() {
  try {
    const gate = await resolveSitemapSeoGate()
    const segmentIds: Array<{ id: string }> = [{ id: 'static' }]

    if (!gate.seoEmissionAllowed || !gate.snapshotFresh) {
      return segmentIds
    }

    const inventoryCount = await countSeoSitemapInventory(getAdminDb())
    const listingChunkCount = countListingSitemapChunks(inventoryCount)
    for (let i = 0; i < listingChunkCount; i++) {
      segmentIds.push({ id: listingSitemapChunkId(i) })
    }

    if (gate.indexingAllowed) {
      segmentIds.push({ id: 'cities' }, { id: 'weekends' })
    }

    return segmentIds
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

  const gate = await resolveSitemapSeoGate()

  if (id === 'cities' || id === 'weekends') {
    if (!gate.indexingAllowed || !gate.snapshotFresh) {
      return []
    }
    const slugs = await loadGeoSitemapMetroSlugs(gate.seoEmissionAllowed, getAdminDb())
    if (id === 'cities') {
      return buildCitySitemapEntriesFromQualifiedSlugs(slugs)
    }
    return buildWeekendSitemapEntriesFromQualifiedSlugs(slugs)
  }

  const chunkIndex = parseListingSitemapChunkId(id)
  if (chunkIndex != null) {
    if (!gate.seoEmissionAllowed || !gate.snapshotFresh) {
      return []
    }
    const rows = await loadSeoSitemapInventoryChunk(chunkIndex, getAdminDb())
    return buildListingSitemapEntriesForChunk(rows, chunkIndex)
  }

  return []
}
