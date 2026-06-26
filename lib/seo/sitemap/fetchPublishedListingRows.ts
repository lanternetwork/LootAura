import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import {
  isIngestedSaleDuplicateSuppressed,
  isSaleSeoIndexEligible,
  type SaleSeoIndexEligibilityInput,
} from '@/lib/seo/isSaleSeoIndexEligible'
import { resolveSeoMetroForSale } from '@/lib/seo/metroCatalog'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import type { ListingSitemapRow } from '@/lib/seo/sitemap/listingEntries'

export type SeoSitemapInventoryBuildRow = {
  sale_id: string
  canonical_url: string
  city_slug: string | null
  updated_at: string
}

const PAGE_SIZE = 1000
const INGESTED_CHUNK = 100

type SaleRow = SaleSeoIndexEligibilityInput & {
  id: string
  updated_at: string
  city?: string | null
  state?: string | null
}

type IngestedLinkRow = {
  published_sale_id: string | null
  is_duplicate: boolean | null
  superseded_by_ingested_sale_id: string | null
}

async function loadIngestedFlagsByPublishedSaleId(
  admin: ReturnType<typeof getAdminDb>,
  saleIds: string[]
): Promise<Map<string, { ingestedIsDuplicate: boolean; ingestedSuperseded: boolean }>> {
  const map = new Map<string, { ingestedIsDuplicate: boolean; ingestedSuperseded: boolean }>()
  if (saleIds.length === 0) return map

  for (let i = 0; i < saleIds.length; i += INGESTED_CHUNK) {
    const chunk = saleIds.slice(i, i + INGESTED_CHUNK)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('published_sale_id, is_duplicate, superseded_by_ingested_sale_id')
      .in('published_sale_id', chunk)

    if (error) {
      console.error('[SEO_SITEMAP] Failed to fetch ingested duplicate flags:', error.message)
      continue
    }

    for (const row of (Array.isArray(data) ? data : []) as IngestedLinkRow[]) {
      const saleId = row.published_sale_id?.trim()
      if (!saleId) continue
      const suppressed = isIngestedSaleDuplicateSuppressed(row)
      const existing = map.get(saleId)
      if (!existing) {
        map.set(saleId, {
          ingestedIsDuplicate: row.is_duplicate === true,
          ingestedSuperseded: Boolean(row.superseded_by_ingested_sale_id?.trim()),
        })
        continue
      }
      map.set(saleId, {
        ingestedIsDuplicate: existing.ingestedIsDuplicate || row.is_duplicate === true,
        ingestedSuperseded:
          existing.ingestedSuperseded || Boolean(row.superseded_by_ingested_sale_id?.trim()),
      })
      if (suppressed) {
        map.set(saleId, {
          ingestedIsDuplicate: true,
          ingestedSuperseded:
            existing.ingestedSuperseded || Boolean(row.superseded_by_ingested_sale_id?.trim()),
        })
      }
    }
  }

  return map
}

/** Ingested duplicate/superseded flags for a single published sale (listing metadata). */
export async function loadIngestedEligibilityFlagsForPublishedSale(
  saleId: string
): Promise<{ ingestedIsDuplicate: boolean; ingestedSuperseded: boolean }> {
  const admin = getAdminDb()
  const map = await loadIngestedFlagsByPublishedSaleId(admin, [saleId])
  return map.get(saleId) ?? { ingestedIsDuplicate: false, ingestedSuperseded: false }
}

function toEligibilityInput(
  row: SaleRow,
  ingestedFlags: Map<string, { ingestedIsDuplicate: boolean; ingestedSuperseded: boolean }>
): SaleSeoIndexEligibilityInput {
  const flags = ingestedFlags.get(row.id)
  return {
    status: row.status,
    archived_at: row.archived_at,
    moderation_status: row.moderation_status,
    ends_at: row.ends_at,
    external_source_url: row.external_source_url,
    lat: row.lat,
    lng: row.lng,
    ingestedIsDuplicate: flags?.ingestedIsDuplicate ?? false,
    ingestedSuperseded: flags?.ingestedSuperseded ?? false,
  }
}

/**
 * YSTM map-visible published sales eligible for SEO inventory emission (sitemap cohort).
 * Aligns with publishedActiveLootAuraYstmUrls + isSaleSeoIndexEligible.
 */
export async function fetchPublishedListingRowsForSitemap(
  now: Date = new Date()
): Promise<ListingSitemapRow[]> {
  const admin = getAdminDb()
  const candidates: SaleRow[] = []
  let from = 0

  for (;;) {
    let q = fromBase(admin, T.sales).select(
      'id, updated_at, status, archived_at, moderation_status, ends_at, external_source_url, lat, lng'
    )
    q = applyPhase4PublicPublishedSaleReadFilters(q, { now })
    const { data, error } = await q.order('updated_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('[SEO_SITEMAP] Failed to fetch published listings:', error.message)
      return []
    }

    const chunk = (Array.isArray(data) ? data : []) as SaleRow[]
    for (const row of chunk) {
      const url = row.external_source_url?.trim()
      if (!url || !isYstmDetailListingUrl(url)) continue
      if (row.lat == null || row.lng == null) continue
      candidates.push(row)
    }

    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const ingestedFlags = await loadIngestedFlagsByPublishedSaleId(
    admin,
    candidates.map((row) => row.id)
  )

  const seenCanonical = new Set<string>()
  const out: ListingSitemapRow[] = []
  const nowMs = now.getTime()

  for (const row of candidates) {
    const canonical = canonicalSourceUrl(row.external_source_url!.trim())
    if (seenCanonical.has(canonical)) continue
    if (!isSaleSeoIndexEligible(toEligibilityInput(row, ingestedFlags), nowMs)) continue
    seenCanonical.add(canonical)
    out.push({ id: row.id, updated_at: row.updated_at })
  }

  return out
}

/**
 * Full inventory cohort for seo_sitemap_inventory snapshot (cron only).
 * Reuses isSaleSeoIndexEligible + canonical dedupe from fetchPublishedListingRowsForSitemap.
 */
export async function fetchPublishedListingInventoryForSnapshot(
  now: Date = new Date()
): Promise<SeoSitemapInventoryBuildRow[]> {
  const admin = getAdminDb()
  const candidates: SaleRow[] = []
  let from = 0

  for (;;) {
    let q = fromBase(admin, T.sales).select(
      'id, updated_at, status, archived_at, moderation_status, ends_at, external_source_url, lat, lng, city, state'
    )
    q = applyPhase4PublicPublishedSaleReadFilters(q, { now })
    const { data, error } = await q.order('updated_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('[SEO_SITEMAP] Failed to fetch published listings for inventory snapshot:', error.message)
      return []
    }

    const chunk = (Array.isArray(data) ? data : []) as SaleRow[]
    for (const row of chunk) {
      const url = row.external_source_url?.trim()
      if (!url || !isYstmDetailListingUrl(url)) continue
      if (row.lat == null || row.lng == null) continue
      candidates.push(row)
    }

    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const ingestedFlags = await loadIngestedFlagsByPublishedSaleId(
    admin,
    candidates.map((row) => row.id)
  )

  const seenCanonical = new Set<string>()
  const out: SeoSitemapInventoryBuildRow[] = []
  const nowMs = now.getTime()

  for (const row of candidates) {
    const canonical = canonicalSourceUrl(row.external_source_url!.trim())
    if (seenCanonical.has(canonical)) continue
    if (!isSaleSeoIndexEligible(toEligibilityInput(row, ingestedFlags), nowMs)) continue
    seenCanonical.add(canonical)
    const metro = resolveSeoMetroForSale({ city: row.city, state: row.state })
    out.push({
      sale_id: row.id,
      canonical_url: canonical,
      city_slug: metro?.slug ?? null,
      updated_at: row.updated_at,
    })
  }

  return out
}
