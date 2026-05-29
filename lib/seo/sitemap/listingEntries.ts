import type { MetadataRoute } from 'next'
import { getSeoBaseUrl, SEO_LISTING_SITEMAP_CHUNK_SIZE } from '@/lib/seo/constants'
import { getListingCanonicalPath } from '@/lib/seo/canonical'

export type ListingSitemapRow = {
  id: string
  updated_at: string
}

export function buildListingSitemapEntriesForChunk(
  rows: ListingSitemapRow[],
  chunkIndex: number
): MetadataRoute.Sitemap {
  const baseUrl = getSeoBaseUrl()
  const start = chunkIndex * SEO_LISTING_SITEMAP_CHUNK_SIZE

  return rows.slice(start, start + SEO_LISTING_SITEMAP_CHUNK_SIZE).map((sale) => ({
    url: `${baseUrl}${getListingCanonicalPath(sale.id)}`,
    lastModified: new Date(sale.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))
}

export function countListingSitemapChunks(totalListings: number): number {
  if (totalListings <= 0) return 0
  return Math.ceil(totalListings / SEO_LISTING_SITEMAP_CHUNK_SIZE)
}

export function listingSitemapChunkId(chunkIndex: number): string {
  return `listings-${chunkIndex}`
}

export function parseListingSitemapChunkId(id: string): number | null {
  if (!id.startsWith('listings-')) return null
  const n = Number.parseInt(id.slice('listings-'.length), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}
