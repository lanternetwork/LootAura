import {
  countListingSitemapChunks,
  listingSitemapChunkId,
} from '@/lib/seo/sitemap/listingEntries'

export type SeoSitemapSegmentId = 'static' | string

export type SeoSitemapPlan = {
  /** Whether listing/city/weekend segments may appear in sitemaps. */
  indexingEnabled: boolean
  segmentIds: SeoSitemapSegmentId[]
  listingChunkCount: number
  totalPublishedListings: number
}

export function resolveSeoSitemapPlan(
  totalPublishedListings: number,
  inventoryIndexingAllowed: boolean
): SeoSitemapPlan {
  const indexingEnabled = inventoryIndexingAllowed
  const segmentIds: SeoSitemapSegmentId[] = ['static']

  let listingChunkCount = 0
  if (indexingEnabled && totalPublishedListings > 0) {
    listingChunkCount = countListingSitemapChunks(totalPublishedListings)
    for (let i = 0; i < listingChunkCount; i++) {
      segmentIds.push(listingSitemapChunkId(i))
    }
    segmentIds.push('cities', 'weekends')
  }

  return {
    indexingEnabled,
    segmentIds,
    listingChunkCount,
    totalPublishedListings,
  }
}
