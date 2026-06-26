import { SEO_LISTING_SITEMAP_CHUNK_SIZE } from '@/lib/seo/constants'
import type { ListingSitemapRow } from '@/lib/seo/sitemap/listingEntries'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export async function countSeoSitemapInventory(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<number> {
  const { count, error } = await fromBase(admin, 'seo_sitemap_inventory')
    .select('sale_id', { count: 'exact', head: true })

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

export async function loadLatestSeoSitemapInventoryUpdatedAt(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<string | null> {
  const { data, error } = await fromBase(admin, 'seo_sitemap_inventory')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as { updated_at: string } | null)?.updated_at ?? null
}

export async function loadSeoSitemapInventoryChunk(
  chunkIndex: number,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<ListingSitemapRow[]> {
  const start = chunkIndex * SEO_LISTING_SITEMAP_CHUNK_SIZE
  const end = start + SEO_LISTING_SITEMAP_CHUNK_SIZE - 1

  const { data, error } = await fromBase(admin, 'seo_sitemap_inventory')
    .select('sale_id, updated_at')
    .gte('sort_order', start)
    .lte('sort_order', end)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => {
    const r = row as { sale_id: string; updated_at: string }
    return { id: r.sale_id, updated_at: r.updated_at }
  })
}
