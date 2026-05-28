/** Maximum URLs per listing sitemap chunk (Google limit is 50k; keep chunks conservative). */
export const SEO_LISTING_SITEMAP_CHUNK_SIZE = 1000

/** Canonical metro inventory surface path prefix (single surface per spec). */
export const SEO_METRO_INVENTORY_PATH_PREFIX = '/yard-sales'

/** Weekend inventory surface path prefix. */
export const SEO_WEEKEND_PATH_PREFIX = '/yard-sales-this-weekend'

/** Listing detail canonical path prefix — identity is sale id only. */
export const SEO_LISTING_PATH_PREFIX = '/sales'

export const SEO_SITE_NAME = 'Loot Aura'

export function getSeoBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.app').replace(/\/$/, '')
}

/**
 * Master kill switch for public indexing / sitemap inclusion (Phase 0).
 * Indexing requires explicit opt-in even when operational gates pass.
 */
export function isSeoPublicIndexingEnabled(): boolean {
  return process.env.SEO_PUBLIC_INDEXING_ENABLED === 'true'
}
