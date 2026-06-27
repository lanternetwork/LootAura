import { resolveSeoMetroForSale } from '@/lib/seo/metroCatalog'
import { applyPublishedSaleCityStateFootprint } from '@/lib/seo/publishedSaleCityStateQuery'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'

export type SeoMetroHistorySnapshotRow = {
  slug: string
  city: string
  state: string
  timezone: string
  inventory_count_90d: number
  last_seen_at: string | null
  updated_at: string
}

const PAGE_SIZE = 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

/**
 * 90-day published sale footprint per metro (existence-only cohort).
 * Not isSaleSeoIndexEligible — used only for page existence tier 3.
 */
export async function buildSeoMetroHistorySnapshot(
  now: Date = new Date()
): Promise<SeoMetroHistorySnapshotRow[]> {
  const admin = getAdminDb()
  const cutoff = new Date(now.getTime() - NINETY_DAYS_MS).toISOString()
  const updatedAt = now.toISOString()
  const bySlug = new Map<
    string,
    { city: string; state: string; timezone: string; count: number; lastSeen: string | null }
  >()

  let offset = 0
  for (;;) {
    const { data, error } = await applyPublishedSaleCityStateFootprint(
      fromBase(admin, T.sales).select('city, state, updated_at')
    )
      .gte('updated_at', cutoff)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      console.error('[SEO_METRO_HISTORY] fetch failed:', error.message)
      break
    }

    const chunk = data ?? []
    for (const row of chunk) {
      const city = (row as { city?: string }).city
      const state = (row as { state?: string }).state
      const updated = (row as { updated_at?: string }).updated_at
      if (!city?.trim() || !state?.trim() || !updated?.trim()) continue

      const metro = resolveSeoMetroForSale({ city, state })
      if (!metro) continue

      const existing = bySlug.get(metro.slug)
      if (!existing) {
        bySlug.set(metro.slug, {
          city: metro.city,
          state: metro.state,
          timezone: metro.timezone,
          count: 1,
          lastSeen: updated,
        })
        continue
      }

      existing.count += 1
      if (!existing.lastSeen || updated > existing.lastSeen) {
        existing.lastSeen = updated
      }
    }

    if (chunk.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return Array.from(bySlug.entries())
    .map(([slug, row]) => ({
      slug,
      city: row.city,
      state: row.state,
      timezone: row.timezone,
      inventory_count_90d: row.count,
      last_seen_at: row.lastSeen,
      updated_at: updatedAt,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function persistSeoMetroHistorySnapshot(
  rows: SeoMetroHistorySnapshotRow[],
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<void> {
  const { error: deleteError } = await fromBase(admin, 'seo_metro_history').delete().neq('slug', '')
  if (deleteError) {
    throw new Error(deleteError.message)
  }

  if (rows.length === 0) return

  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize)
    const { error } = await fromBase(admin, 'seo_metro_history').insert(slice)
    if (error) {
      throw new Error(error.message)
    }
  }
}

export async function refreshSeoMetroHistorySnapshotCron(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<{ rowCount: number }> {
  const rows = await buildSeoMetroHistorySnapshot()
  await persistSeoMetroHistorySnapshot(rows, admin)
  return { rowCount: rows.length }
}
