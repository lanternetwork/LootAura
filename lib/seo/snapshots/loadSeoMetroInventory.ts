import { SEO_METRO_INVENTORY_PAGE_LIMIT } from '@/lib/seo/constants'
import { buildInventorySummary } from '@/lib/seo/inventorySummary'
import type { MetroInventoryResult } from '@/lib/seo/fetchMetroInventory'
import { SEO_SNAPSHOT_MAX_AGE_MS } from '@/lib/seo/snapshots/constants'
import { isEnablementSnapshotFresh } from '@/lib/seo/snapshots/loadSeoEnablementSnapshot'
import type { SeoMetroInventoryRow } from '@/lib/seo/snapshots/types'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { Sale } from '@/lib/types'

const EMPTY_SUMMARY = {
  activeListingCount: 0,
  lastUpdatedAt: null,
  crawlableInventoryPct: 0,
} as const

export async function loadLatestSeoMetroInventoryUpdatedAt(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<string | null> {
  const { data, error } = await fromBase(admin, 'seo_metro_inventory')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as { updated_at: string } | null)?.updated_at ?? null
}

export async function countSeoMetroInventory(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<number> {
  const { count, error } = await fromBase(admin, 'seo_metro_inventory')
    .select('sale_id', { count: 'exact', head: true })

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

/** Existence tier — not fail-closed on snapshot age (CITY_PAGE_COVERAGE_V2.1). */
export async function countMetroInventoryBySlug(
  metroSlug: string,
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<number> {
  const { count, error } = await fromBase(admin, 'seo_metro_inventory')
    .select('sale_id', { count: 'exact', head: true })
    .eq('metro_slug', metroSlug)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

function metroInventoryRowToSale(row: SeoMetroInventoryRow): Sale {
  return {
    id: row.sale_id,
    owner_id: '',
    title: row.title,
    city: row.city,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    date_start: row.starts_at,
    time_start: '08:00',
    date_end: row.ends_at ?? undefined,
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: row.updated_at,
    updated_at: row.updated_at,
  }
}

/**
 * Snapshot-backed metro inventory for city/weekend pages.
 * Fail-closed when metro inventory snapshot is missing or stale (>60min).
 */
export async function loadMetroInventoryFromSnapshot(
  metroSlug: string,
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  now: Date = new Date()
): Promise<MetroInventoryResult> {
  const latestUpdatedAt = await loadLatestSeoMetroInventoryUpdatedAt(admin)
  if (!isEnablementSnapshotFresh(latestUpdatedAt, now.getTime(), SEO_SNAPSHOT_MAX_AGE_MS)) {
    return { sales: [], summary: { ...EMPTY_SUMMARY } }
  }

  const { data, error } = await fromBase(admin, 'seo_metro_inventory')
    .select(
      'metro_slug, sale_id, canonical_url, title, city, state, starts_at, ends_at, latitude, longitude, updated_at'
    )
    .eq('metro_slug', metroSlug)
    .order('starts_at', { ascending: true })
    .limit(SEO_METRO_INVENTORY_PAGE_LIMIT)

  if (error) {
    console.error('[SEO_METRO_INVENTORY] snapshot read failed:', metroSlug, error.message)
    return { sales: [], summary: { ...EMPTY_SUMMARY } }
  }

  const sales = ((data ?? []) as SeoMetroInventoryRow[]).map(metroInventoryRowToSale)
  return { sales, summary: buildInventorySummary(sales) }
}
