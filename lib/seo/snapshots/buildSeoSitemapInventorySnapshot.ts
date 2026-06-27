import { fetchPublishedListingInventoryForSnapshot } from '@/lib/seo/sitemap/fetchPublishedListingRows'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export async function buildSeoSitemapInventorySnapshot(
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  now: Date = new Date()
): Promise<{ rowCount: number; updatedAt: string }> {
  const rows = await fetchPublishedListingInventoryForSnapshot(now)
  const updatedAt = now.toISOString()

  const { error: deleteError } = await fromBase(admin, 'seo_sitemap_inventory').delete().gte('sort_order', 0)
  if (deleteError) {
    throw new Error(deleteError.message)
  }

  if (rows.length === 0) {
    return { rowCount: 0, updatedAt }
  }

  const payload = rows.map((row, index) => ({
    sale_id: row.sale_id,
    canonical_url: row.canonical_url,
    city_slug: row.city_slug,
    sort_order: index,
    updated_at: row.updated_at,
  }))

  const chunkSize = 200
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize)
    const { error } = await fromBase(admin, 'seo_sitemap_inventory').insert(slice)
    if (error) {
      throw new Error(error.message)
    }
  }

  return { rowCount: rows.length, updatedAt }
}

export async function refreshSeoSitemapInventorySnapshotCron(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<{ rowCount: number; updatedAt: string }> {
  return buildSeoSitemapInventorySnapshot(admin)
}
