import {
  countListingSitemapChunks,
  listingSitemapChunkId,
} from '@/lib/seo/sitemap/listingEntries'

export type SeoSitemapSegmentId = 'static' | string

export type SeoSitemapPlan = {
  /** Whether any non-static segments may appear in sitemaps. */
  indexingEnabled: boolean
  segmentIds: SeoSitemapSegmentId[]
  listingChunkCount: number
  totalPublishedListings: number
}

export function resolveSeoSitemapPlan(
  totalPublishedListings: number,
  options: {
    seoEmissionAllowed: boolean
    indexingAllowed: boolean
  }
): SeoSitemapPlan {
  const segmentIds: SeoSitemapSegmentId[] = ['static']
  let listingChunkCount = 0

  if (options.seoEmissionAllowed && totalPublishedListings > 0) {
    listingChunkCount = countListingSitemapChunks(totalPublishedListings)
    for (let i = 0; i < listingChunkCount; i++) {
      segmentIds.push(listingSitemapChunkId(i))
    }
  }

  if (options.indexingAllowed) {
    segmentIds.push('cities', 'weekends')
  }

  return {
    indexingEnabled: options.seoEmissionAllowed || options.indexingAllowed,
    segmentIds,
    listingChunkCount,
    totalPublishedListings,
  }
}
