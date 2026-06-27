import { SEO_METRO_MIN_ACTIVE_LISTINGS } from '@/lib/seo/metroCatalog'
import { buildInventorySummary } from '@/lib/seo/inventorySummary'
import { qualifyAllSeoMetros } from '@/lib/seo/metroQualification'
import {
  geographyRowToSeoMetro,
  loadAllSeoMetroGeography,
} from '@/lib/seo/snapshots/loadSeoMetroGeography'
import type { SeoInventorySummary } from '@/lib/seo/types'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type SeoQualifiedMetroSnapshotRow = {
  slug: string
  qualified: boolean
  listing_count: number
  crawlable_ratio: number
  city: string
  state: string
  timezone: string
  updated_at: string
}

async function loadInventorySummariesFromMetroSnapshot(
  admin: ReturnType<typeof getAdminDb>
): Promise<Record<string, SeoInventorySummary>> {
  const { data, error } = await fromBase(admin, 'seo_metro_inventory').select(
    'metro_slug, starts_at, ends_at, updated_at'
  )

  if (error) {
    throw new Error(error.message)
  }

  const bySlug = new Map<string, Array<{ starts_at: string; ends_at: string | null; updated_at: string }>>()
  for (const row of data ?? []) {
    const slug = String((row as { metro_slug: string }).metro_slug)
    const bucket = bySlug.get(slug) ?? []
    bucket.push({
      starts_at: String((row as { starts_at: string }).starts_at),
      ends_at: (row as { ends_at: string | null }).ends_at,
      updated_at: String((row as { updated_at: string }).updated_at),
    })
    bySlug.set(slug, bucket)
  }

  const inventoryBySlug: Record<string, SeoInventorySummary> = {}
  for (const [slug, rows] of bySlug.entries()) {
    const sales = rows.map((row) => ({
      id: slug,
      owner_id: '',
      title: '',
      city: '',
      state: '',
      lat: 0,
      lng: 0,
      date_start: row.starts_at,
      time_start: '08:00',
      date_end: row.ends_at ?? undefined,
      status: 'published' as const,
      privacy_mode: 'exact' as const,
      is_featured: false,
      created_at: row.updated_at,
      updated_at: row.updated_at,
    }))
    inventoryBySlug[slug] = buildInventorySummary(sales)
  }

  return inventoryBySlug
}

export async function buildSeoQualifiedMetrosSnapshot(
  admin: ReturnType<typeof getAdminDb> = getAdminDb(),
  now: Date = new Date()
): Promise<SeoQualifiedMetroSnapshotRow[]> {
  const geography = await loadAllSeoMetroGeography(admin)
  const metros = geography.map(geographyRowToSeoMetro)
  const inventoryBySlug = await loadInventorySummariesFromMetroSnapshot(admin)
  const qualifiedResults = qualifyAllSeoMetros({
    metros,
    nationalIndexingAllowed: true,
    inventoryBySlug,
  })
  const updatedAt = now.toISOString()

  return qualifiedResults.map((result) => {
    const metro = metros.find((m) => m.slug === result.slug)
    const inventory = inventoryBySlug[result.slug] ?? {
      activeListingCount: 0,
      crawlableInventoryPct: 0,
      lastUpdatedAt: null,
    }
    return {
      slug: result.slug,
      qualified: result.qualified,
      listing_count: inventory.activeListingCount,
      crawlable_ratio: inventory.crawlableInventoryPct,
      city: metro?.city ?? '',
      state: metro?.state ?? '',
      timezone: metro?.timezone ?? 'America/Chicago',
      updated_at: updatedAt,
    }
  })
}

export async function persistSeoQualifiedMetrosSnapshot(
  rows: SeoQualifiedMetroSnapshotRow[],
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<void> {
  const { error: deleteError } = await fromBase(admin, 'seo_qualified_metros').delete().neq('slug', '')
  if (deleteError) {
    throw new Error(deleteError.message)
  }

  if (rows.length === 0) return

  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize)
    const { error } = await fromBase(admin, 'seo_qualified_metros').insert(slice)
    if (error) {
      throw new Error(error.message)
    }
  }
}

export async function refreshSeoQualifiedMetrosSnapshotCron(
  admin: ReturnType<typeof getAdminDb> = getAdminDb()
): Promise<{ rowCount: number; qualifiedCount: number }> {
  const rows = await buildSeoQualifiedMetrosSnapshot(admin)
  await persistSeoQualifiedMetrosSnapshot(rows, admin)
  return {
    rowCount: rows.length,
    qualifiedCount: rows.filter((row) => row.qualified).length,
  }
}
