import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type LootAuraPublishedYstmIndex = {
  /** Canonical YSTM detail URLs visible on map/API today. */
  visibleCanonicalUrls: Set<string>
  publishedActiveTotal: number
}

type SaleRow = {
  external_source_url: string | null
  lat: number | null
  lng: number | null
}

/**
 * Loads all published, active, map-visible YSTM sales keyed by canonical external_source_url.
 */
export async function loadLootAuraPublishedYstmIndex(
  admin: ReturnType<typeof getAdminDb>,
  now: Date = new Date()
): Promise<LootAuraPublishedYstmIndex> {
  const visibleCanonicalUrls = new Set<string>()
  const pageSize = 1000
  let from = 0

  for (;;) {
    let q = fromBase(admin, 'sales').select('external_source_url, lat, lng')
    q = applyPhase4PublicPublishedSaleReadFilters(q, { now })
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as SaleRow[]
    for (const row of chunk) {
      const raw = row.external_source_url?.trim()
      if (!raw || !isYstmDetailListingUrl(raw)) continue
      if (row.lat == null || row.lng == null) continue
      visibleCanonicalUrls.add(canonicalSourceUrl(raw))
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return {
    visibleCanonicalUrls,
    publishedActiveTotal: visibleCanonicalUrls.size,
  }
}
