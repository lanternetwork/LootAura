import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmCoverageVisibleFootprintRow = {
  saleId: string
  ingestedSaleId: string | null
  saleInstanceKey: string | null
  sourceListingId: string | null
  canonicalSourceUrl: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
}

export type YstmCoverageLootAuraMatchIndex = {
  visibleCanonicalUrls: Set<string>
  visibleByCanonicalUrl: Map<string, YstmCoverageVisibleFootprintRow>
  visibleAliasByCanonical: Map<string, YstmCoverageVisibleFootprintRow[]>
  bySaleInstanceKey: Map<string, YstmCoverageVisibleFootprintRow>
  bySourceListingId: Map<string, YstmCoverageVisibleFootprintRow[]>
  byNormalizedAddress: Map<string, YstmCoverageVisibleFootprintRow[]>
  publishedActiveTotal: number
}

type VisibleSaleRow = {
  id: string
  external_source_url: string | null
  lat: number | null
  lng: number | null
}

type IngestedFootprintRow = {
  id: string
  published_sale_id: string | null
  sale_instance_key: string | null
  source_listing_id: string | null
  normalized_address: string | null
  date_start: string | null
  date_end: string | null
  superseded_by_ingested_sale_id: string | null
  is_duplicate: boolean
}

type AliasRow = {
  ingested_sale_id: string
  canonical_source_url: string
}

function normalizeAddressLine(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
}

function addToListingIndex(
  map: Map<string, YstmCoverageVisibleFootprintRow[]>,
  listingId: string,
  row: YstmCoverageVisibleFootprintRow
): void {
  const key = listingId.trim()
  const list = map.get(key) ?? []
  list.push(row)
  map.set(key, list)
}

function addToAddressIndex(
  map: Map<string, YstmCoverageVisibleFootprintRow[]>,
  address: string,
  row: YstmCoverageVisibleFootprintRow
): void {
  const list = map.get(address) ?? []
  list.push(row)
  map.set(address, list)
}

function addAlias(
  map: Map<string, YstmCoverageVisibleFootprintRow[]>,
  canonical: string,
  row: YstmCoverageVisibleFootprintRow
): void {
  const list = map.get(canonical) ?? []
  if (!list.some((r) => r.saleId === row.saleId)) {
    list.push(row)
    map.set(canonical, list)
  }
}

async function loadVisibleYstmSales(
  admin: ReturnType<typeof getAdminDb>,
  now: Date
): Promise<VisibleSaleRow[]> {
  const out: VisibleSaleRow[] = []
  const pageSize = 1000
  let from = 0

  for (;;) {
    let q = fromBase(admin, 'sales').select('id, external_source_url, lat, lng')
    q = applyPhase4PublicPublishedSaleReadFilters(q, { now })
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = (data ?? []) as VisibleSaleRow[]
    for (const row of chunk) {
      const raw = row.external_source_url?.trim()
      if (!raw || !isYstmDetailListingUrl(raw)) continue
      if (row.lat == null || row.lng == null) continue
      out.push(row)
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return out
}

async function loadIngestedFootprintsForSales(
  admin: ReturnType<typeof getAdminDb>,
  saleIds: string[]
): Promise<Map<string, IngestedFootprintRow>> {
  const bySaleId = new Map<string, IngestedFootprintRow>()
  if (saleIds.length === 0) return bySaleId

  const chunkSize = 100
  for (let i = 0; i < saleIds.length; i += chunkSize) {
    const slice = saleIds.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, published_sale_id, sale_instance_key, source_listing_id, normalized_address, date_start, date_end, superseded_by_ingested_sale_id, is_duplicate'
      )
      .in('published_sale_id', slice)
      .eq('is_duplicate', false)
      .is('superseded_by_ingested_sale_id', null)
    if (error) throw new Error(error.message)

    for (const row of (data ?? []) as IngestedFootprintRow[]) {
      const saleId = row.published_sale_id?.trim()
      if (!saleId || bySaleId.has(saleId)) continue
      bySaleId.set(saleId, row)
    }
  }

  return bySaleId
}

async function loadAliasRowsForIngested(
  admin: ReturnType<typeof getAdminDb>,
  ingestedIds: string[]
): Promise<AliasRow[]> {
  if (ingestedIds.length === 0) return []
  const out: AliasRow[] = []
  const chunkSize = 100

  for (let i = 0; i < ingestedIds.length; i += chunkSize) {
    const slice = ingestedIds.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sale_source_urls')
      .select('ingested_sale_id, canonical_source_url')
      .in('ingested_sale_id', slice)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as AliasRow[]))
  }

  return out
}

/**
 * Loads map-visible YSTM sales with sale-instance fields for Phase 11 coverage matching.
 */
export async function loadYstmCoverageLootAuraMatchIndex(
  admin: ReturnType<typeof getAdminDb>,
  now: Date = new Date()
): Promise<YstmCoverageLootAuraMatchIndex> {
  const visibleSales = await loadVisibleYstmSales(admin, now)
  const saleIds = visibleSales.map((s) => String(s.id))
  const ingestedBySaleId = await loadIngestedFootprintsForSales(admin, saleIds)

  const footprintBySaleId = new Map<string, YstmCoverageVisibleFootprintRow>()
  for (const sale of visibleSales) {
    const saleId = String(sale.id)
    const ingested = ingestedBySaleId.get(saleId)
    const rawUrl = sale.external_source_url?.trim() ?? null
    const canonical = rawUrl ? canonicalSourceUrl(rawUrl) : null
    footprintBySaleId.set(saleId, {
      saleId,
      ingestedSaleId: ingested?.id ? String(ingested.id) : null,
      saleInstanceKey: ingested?.sale_instance_key ?? null,
      sourceListingId: ingested?.source_listing_id ?? null,
      canonicalSourceUrl: canonical,
      normalizedAddress: normalizeAddressLine(ingested?.normalized_address),
      dateStart: ingested?.date_start ?? null,
      dateEnd: ingested?.date_end ?? null,
    })
  }

  const ingestedIds = [...ingestedBySaleId.values()]
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id))
  const aliasRows = await loadAliasRowsForIngested(admin, ingestedIds)
  const footprintByIngestedId = new Map<string, YstmCoverageVisibleFootprintRow>()
  for (const row of footprintBySaleId.values()) {
    if (row.ingestedSaleId) {
      footprintByIngestedId.set(row.ingestedSaleId, row)
    }
  }

  const index: YstmCoverageLootAuraMatchIndex = {
    visibleCanonicalUrls: new Set<string>(),
    visibleByCanonicalUrl: new Map(),
    visibleAliasByCanonical: new Map(),
    bySaleInstanceKey: new Map(),
    bySourceListingId: new Map(),
    byNormalizedAddress: new Map(),
    publishedActiveTotal: footprintBySaleId.size,
  }

  for (const row of footprintBySaleId.values()) {
    if (row.canonicalSourceUrl) {
      index.visibleCanonicalUrls.add(row.canonicalSourceUrl)
      index.visibleByCanonicalUrl.set(row.canonicalSourceUrl, row)
    }
    const key = row.saleInstanceKey?.trim()
    if (key) index.bySaleInstanceKey.set(key, row)
    if (row.sourceListingId?.trim()) {
      addToListingIndex(index.bySourceListingId, row.sourceListingId, row)
    }
    const address = row.normalizedAddress
    if (address) addToAddressIndex(index.byNormalizedAddress, address, row)
  }

  for (const alias of aliasRows) {
    const footprint = footprintByIngestedId.get(String(alias.ingested_sale_id))
    if (!footprint) continue
    addAlias(index.visibleAliasByCanonical, alias.canonical_source_url, footprint)
  }

  return index
}
