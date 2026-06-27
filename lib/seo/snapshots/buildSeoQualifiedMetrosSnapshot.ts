import { fetchNationwideSeoMetroInventory } from '@/lib/seo/fetchAllSeoMetroInventory'
import { qualifyAllSeoMetros } from '@/lib/seo/metroQualification'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type SeoQualifiedMetroSnapshotRow = {
  slug: string
  qualified: boolean
  listing_count: number
  crawlable_ratio: number
  updated_at: string
}

export async function buildSeoQualifiedMetrosSnapshot(
  now: Date = new Date()
): Promise<SeoQualifiedMetroSnapshotRow[]> {
  const { metros, inventoryBySlug } = await fetchNationwideSeoMetroInventory()
  const qualifiedResults = qualifyAllSeoMetros({
    metros,
    nationalIndexingAllowed: true,
    inventoryBySlug,
  })
  const updatedAt = now.toISOString()

  return qualifiedResults.map((result) => {
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
  const rows = await buildSeoQualifiedMetrosSnapshot()
  await persistSeoQualifiedMetrosSnapshot(rows, admin)
  return {
    rowCount: rows.length,
    qualifiedCount: rows.filter((row) => row.qualified).length,
  }
}
