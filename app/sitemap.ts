import type { MetadataRoute } from 'next'
import { buildStaticSitemapEntries } from '@/lib/seo/sitemap/staticEntries'
import {
  buildListingSitemapEntriesForChunk,
  parseListingSitemapChunkId,
} from '@/lib/seo/sitemap/listingEntries'
import { fetchPublishedListingRowsForSitemap } from '@/lib/seo/sitemap/fetchPublishedListingRows'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import { isSeoPublicIndexingEnabled } from '@/lib/seo/constants'

export async function generateSitemaps() {
  if (!isSeoPublicIndexingEnabled()) {
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

  const chunkIndex = parseListingSitemapChunkId(id)
  if (chunkIndex != null) {
    const rows = await fetchPublishedListingRowsForSitemap()
    return buildListingSitemapEntriesForChunk(rows, chunkIndex)
  }

  return []
}
