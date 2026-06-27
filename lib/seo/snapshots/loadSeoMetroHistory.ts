import type { SeoMetroHistoryRow } from '@/lib/seo/snapshots/types'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export async function loadSeoMetroHistoryBySlug(
  slug: string,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<SeoMetroHistoryRow | null> {
  const { data, error } = await fromBase(admin, 'seo_metro_history')
    .select('slug, city, state, timezone, inventory_count_90d, last_seen_at, updated_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as SeoMetroHistoryRow | null) ?? null
}
