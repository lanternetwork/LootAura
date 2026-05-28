import {
  countListingSitemapChunks,
  listingSitemapChunkId,
} from '@/lib/seo/sitemap/listingEntries'
import { isSeoPublicIndexingEnabled } from '@/lib/seo/constants'

export type SeoSitemapSegmentId = 'static' | string

export type SeoSitemapPlan = {
  /** Whether listing/city/weekend segments may appear in sitemaps. */
  indexingEnabled: boolean
  segmentIds: SeoSitemapSegmentId[]
  listingChunkCount: number
  totalPublishedListings: number
}

export function resolveSeoSitemapPlan(totalPublishedListings: number): SeoSitemapPlan {
  const indexingEnabled = isSeoPublicIndexingEnabled()
  const segmentIds: SeoSitemapSegmentId[] = ['static']

  let listingChunkCount = 0
  if (indexingEnabled && totalPublishedListings > 0) {
    listingChunkCount = countListingSitemapChunks(totalPublishedListings)
    for (let i = 0; i < listingChunkCount; i++) {
      segmentIds.push(listingSitemapChunkId(i))
    }
    // City/weekend segments activate in Phase 2/3 when pages exist.
  }

  return {
    indexingEnabled,
    segmentIds,
    listingChunkCount,
    totalPublishedListings,
  }
}
