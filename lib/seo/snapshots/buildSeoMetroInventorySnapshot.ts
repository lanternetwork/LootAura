import { fetchPublishedMetroInventoryForSnapshot } from '@/lib/seo/sitemap/fetchPublishedListingRows'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export async function buildSeoMetroInventorySnapshot(
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  now: Date = new Date()
): Promise<{ rowCount: number; updatedAt: string }> {
  const rows = await fetchPublishedMetroInventoryForSnapshot(now)
  const updatedAt = now.toISOString()

  const { error: deleteError } = await fromBase(admin, 'seo_metro_inventory').delete().neq('metro_slug', '')
  if (deleteError) {
    throw new Error(deleteError.message)
  }

  if (rows.length === 0) {
    return { rowCount: 0, updatedAt }
  }

  const payload = rows.map((row) => ({
    metro_slug: row.metro_slug,
    sale_id: row.sale_id,
    canonical_url: row.canonical_url,
    title: row.title,
    city: row.city,
    state: row.state,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    latitude: row.latitude,
    longitude: row.longitude,
    updated_at: row.updated_at,
  }))

  const chunkSize = 200
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize)
    const { error } = await fromBase(admin, 'seo_metro_inventory').insert(slice)
    if (error) {
      throw new Error(error.message)
    }
  }

  return { rowCount: rows.length, updatedAt }
}

export async function refreshSeoMetroInventorySnapshotCron(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<{ rowCount: number; updatedAt: string }> {
  return buildSeoMetroInventorySnapshot(admin)
}
