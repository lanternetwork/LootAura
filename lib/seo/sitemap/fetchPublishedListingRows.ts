import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import type { ListingSitemapRow } from '@/lib/seo/sitemap/listingEntries'

/**
 * Published sales for sitemap chunking.
 * Uses service-role client (no request cookies) so sitemap generation works at build time.
 */
export async function fetchPublishedListingRowsForSitemap(): Promise<ListingSitemapRow[]> {
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, T.sales)
    .select('id, updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[SEO_SITEMAP] Failed to fetch published listings:', error.message)
    return []
  }

  return (data ?? []) as ListingSitemapRow[]
}
