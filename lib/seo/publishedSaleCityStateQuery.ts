/**
 * City/state footprint for SEO metro catalog discovery.
 * Matches listing sitemap eligibility (`status = published`) so geo-link
 * destinations from indexed listings resolve to catalog metros.
 * Inventory on city/weekend pages still uses phase4 + date filters separately.
 */
export function applyPublishedSaleCityStateFootprint<T>(query: T): T {
  return (query as any).eq('status', 'published').not('city', 'is', null).not('state', 'is', null) as T
}
