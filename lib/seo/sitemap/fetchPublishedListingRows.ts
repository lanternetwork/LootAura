import { createSupabaseServerClient } from '@/lib/supabase/server'
import { T } from '@/lib/supabase/tables'
import type { ListingSitemapRow } from '@/lib/seo/sitemap/listingEntries'

/** Fetch all published sale ids for sitemap chunking (bounded by operational health at plan level). */
export async function fetchPublishedListingRowsForSitemap(): Promise<ListingSitemapRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from(T.sales)
    .select('id, updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[SEO_SITEMAP] Failed to fetch published listings:', error.message)
    return []
  }

  return (data ?? []) as ListingSitemapRow[]
}
