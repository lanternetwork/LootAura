import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { CRAWL_SKIP_DATE_TOLERANCE_DAYS } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import { calendarDaysBetweenUtc } from '@/lib/ingestion/duplicateScoring'
import type { FalseExclusionIngestedRowSnapshot } from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import {
  type YstmCoverageFootprintMatchMethod,
} from '@/lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export const INGESTED_FOOTPRINT_SELECT =
  'id, source_url, canonical_source_url, status, published_sale_id, is_duplicate, address_status, failure_reasons, date_start, date_end, catalog_repair_outcome, source_listing_id, sale_instance_key, address_enrichment_attempts, next_enrichment_attempt_at, address_unlock_at, last_address_enrichment_attempt_at, superseded_by_ingested_sale_id, normalized_address'

export type IngestedFootprintRow = FalseExclusionIngestedRowSnapshot & {
  canonical_source_url: string | null
  normalized_address: string | null
  superseded_by_ingested_sale_id: string | null
}

export type ObservationIngestedFootprintInput = {
  canonicalUrl: string
  saleInstanceKey: string | null
  sourceListingId: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  missingIngestionOutcome?: string | null
  falseExclusionPrimaryBucket?: string | null
}

export type ObservationFootprintSourceRow = {
  canonical_url: string
  sale_instance_key?: string | null
  source_listing_id?: string | null
  matched_ingested_sale_id?: string | null
  missing_ingestion_outcome?: string | null
  false_exclusion_primary_bucket?: string | null
  list_metadata_snapshot?: YstmListMetadataSale | null
}

export type IngestedFootprintResolverIndex = {
  byId: Map<string, IngestedFootprintRow>
  bySaleInstanceKey: Map<string, IngestedFootprintRow[]>
  bySourceListingId: Map<string, IngestedFootprintRow[]>
  aliasByCanonicalUrl: Map<string, IngestedFootprintRow[]>
  directByCanonicalUrl: Map<string, IngestedFootprintRow[]>
  byNormalizedAddress: Map<string, IngestedFootprintRow[]>
}

export type ResolvedIngestedFootprint = {
  ingested: FalseExclusionIngestedRowSnapshot
  matchMethod: YstmCoverageFootprintMatchMethod
}

function normalizeAddressLine(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
}

function datesBeyondTolerance(incomingStart: string | null, existingStart: string | null): boolean {
  if (!incomingStart?.trim() || !existingStart?.trim()) return false
  return (
    calendarDaysBetweenUtc(incomingStart.trim(), existingStart.trim()) >
    CRAWL_SKIP_DATE_TOLERANCE_DAYS
  )
}

function dateWindowsOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  if (!aStart?.trim() || !bStart?.trim()) return false
  if (datesBeyondTolerance(aStart, bStart)) return false
  const aEndVal = aEnd?.trim() || aStart
  const bEndVal = bEnd?.trim() || bStart
  return calendarDaysBetweenUtc(aEndVal, bEndVal) <= CRAWL_SKIP_DATE_TOLERANCE_DAYS
}

function instanceAgreesWithFootprint(
  input: ObservationIngestedFootprintInput,
  row: Pick<IngestedFootprintRow, 'sale_instance_key' | 'source_listing_id' | 'date_start' | 'date_end'>
): boolean {
  const key = input.saleInstanceKey?.trim()
  if (key && row.sale_instance_key?.trim() === key) return true

  const listingId = input.sourceListingId?.trim()
  if (
    listingId &&
    row.source_listing_id?.trim() === listingId &&
    dateWindowsOverlap(input.dateStart, input.dateEnd, row.date_start, row.date_end)
  ) {
    return true
  }

  return !key && !listingId
}

/** PNV + ingested: alias path may link despite stale observation sale_instance_key. */
export function allowStaleInstanceKeyAliasBypass(
  input: Pick<
    ObservationIngestedFootprintInput,
    'falseExclusionPrimaryBucket' | 'missingIngestionOutcome'
  >
): boolean {
  return (
    input.falseExclusionPrimaryBucket === 'published_not_visible' &&
    input.missingIngestionOutcome === 'ingested'
  )
}

export function toIngestedFootprintSnapshot(row: IngestedFootprintRow): FalseExclusionIngestedRowSnapshot {
  return {
    id: row.id,
    source_url: row.source_url,
    status: row.status,
    published_sale_id: row.published_sale_id,
    is_duplicate: row.is_duplicate,
    address_status: row.address_status,
    failure_reasons: row.failure_reasons,
    date_start: row.date_start,
    date_end: row.date_end,
    catalog_repair_outcome: row.catalog_repair_outcome,
    source_listing_id: row.source_listing_id,
    sale_instance_key: row.sale_instance_key,
    address_enrichment_attempts: row.address_enrichment_attempts,
    next_enrichment_attempt_at: row.next_enrichment_attempt_at,
    address_unlock_at: row.address_unlock_at,
    last_address_enrichment_attempt_at: row.last_address_enrichment_attempt_at,
  }
}

export function pickPreferredIngestedFootprint(
  rows: readonly IngestedFootprintRow[]
): IngestedFootprintRow | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => {
    const aSuperseded = Boolean(a.superseded_by_ingested_sale_id?.trim())
    const bSuperseded = Boolean(b.superseded_by_ingested_sale_id?.trim())
    if (aSuperseded !== bSuperseded) return aSuperseded ? 1 : -1
    if (a.is_duplicate !== b.is_duplicate) return a.is_duplicate ? 1 : -1
    if (!a.published_sale_id && b.published_sale_id) return 1
    if (a.published_sale_id && !b.published_sale_id) return -1
    return a.id.localeCompare(b.id)
  })[0] ?? null
}

function addToIndex(
  map: Map<string, IngestedFootprintRow[]>,
  key: string,
  row: IngestedFootprintRow
): void {
  const trimmed = key.trim()
  if (!trimmed) return
  const list = map.get(trimmed) ?? []
  list.push(row)
  map.set(trimmed, list)
}

function registerIngestedRow(index: IngestedFootprintResolverIndex, row: IngestedFootprintRow): void {
  index.byId.set(row.id, row)
  if (row.sale_instance_key?.trim()) {
    addToIndex(index.bySaleInstanceKey, row.sale_instance_key, row)
  }
  if (row.source_listing_id?.trim()) {
    addToIndex(index.bySourceListingId, row.source_listing_id, row)
  }
  const normalizedAddress = normalizeAddressLine(row.normalized_address)
  if (normalizedAddress) {
    addToIndex(index.byNormalizedAddress, normalizedAddress, row)
  }
}

function registerDirectUrl(index: IngestedFootprintResolverIndex, url: string, row: IngestedFootprintRow): void {
  addToIndex(index.directByCanonicalUrl, url, row)
  addToIndex(index.directByCanonicalUrl, canonicalSourceUrl(url), row)
}

function registerAliasUrl(index: IngestedFootprintResolverIndex, url: string, row: IngestedFootprintRow): void {
  addToIndex(index.aliasByCanonicalUrl, url, row)
  addToIndex(index.aliasByCanonicalUrl, canonicalSourceUrl(url), row)
}

export function buildObservationFootprintInput(
  row: ObservationFootprintSourceRow
): ObservationIngestedFootprintInput {
  const meta = row.list_metadata_snapshot
  return {
    canonicalUrl: row.canonical_url,
    saleInstanceKey: row.sale_instance_key ?? null,
    sourceListingId: row.source_listing_id ?? null,
    normalizedAddress: meta?.address ? normalizeAddressLine(meta.address) : null,
    dateStart: meta?.startDate ?? null,
    dateEnd: meta?.endDate ?? null,
    missingIngestionOutcome: row.missing_ingestion_outcome ?? null,
    falseExclusionPrimaryBucket: row.false_exclusion_primary_bucket ?? null,
  }
}

function matchByUrlFootprint(
  input: ObservationIngestedFootprintInput,
  rows: readonly IngestedFootprintRow[],
  matchMethod: 'source_url_alias' | 'source_url_visible'
): ResolvedIngestedFootprint | null {
  const aliasBypass =
    matchMethod === 'source_url_alias' && allowStaleInstanceKeyAliasBypass(input)

  for (const row of rows) {
    if (aliasBypass || instanceAgreesWithFootprint(input, row)) {
      return {
        ingested: toIngestedFootprintSnapshot(row),
        matchMethod,
      }
    }
  }
  return null
}

/**
 * Resolve ingested footprint for an observation using Phase 11 precedence against ingested_sales
 * (not Phase-4-visible published sales only).
 */
export function resolveIngestedFootprintForObservation(
  input: ObservationIngestedFootprintInput,
  index: IngestedFootprintResolverIndex
): ResolvedIngestedFootprint | null {
  const saleInstanceKey = input.saleInstanceKey?.trim() || null
  const sourceListingId = input.sourceListingId?.trim() || null
  const canonical = canonicalSourceUrl(input.canonicalUrl)

  if (saleInstanceKey) {
    const picked = pickPreferredIngestedFootprint(index.bySaleInstanceKey.get(saleInstanceKey) ?? [])
    if (picked) {
      return { ingested: toIngestedFootprintSnapshot(picked), matchMethod: 'sale_instance_key' }
    }
  }

  if (sourceListingId) {
    const candidates = index.bySourceListingId.get(sourceListingId) ?? []
    for (const row of candidates) {
      if (dateWindowsOverlap(input.dateStart, input.dateEnd, row.date_start, row.date_end)) {
        const picked = pickPreferredIngestedFootprint([row])
        if (picked) {
          return {
            ingested: toIngestedFootprintSnapshot(picked),
            matchMethod: 'source_listing_id_date_overlap',
          }
        }
      }
    }
  }

  const aliasRows = [
    ...(index.aliasByCanonicalUrl.get(canonical) ?? []),
    ...(index.aliasByCanonicalUrl.get(input.canonicalUrl) ?? []),
  ]
  const aliasMatch = matchByUrlFootprint(input, aliasRows, 'source_url_alias')
  if (aliasMatch) return aliasMatch

  const directRows = [
    ...(index.directByCanonicalUrl.get(canonical) ?? []),
    ...(index.directByCanonicalUrl.get(input.canonicalUrl) ?? []),
  ]
  const directMatch = matchByUrlFootprint(input, directRows, 'source_url_visible')
  if (directMatch) return directMatch

  const address = normalizeAddressLine(input.normalizedAddress)
  const dateStart = input.dateStart?.trim()
  if (address && dateStart) {
    const candidates = index.byNormalizedAddress.get(address) ?? []
    for (const row of candidates) {
      if (datesBeyondTolerance(dateStart, row.date_start)) continue
      const picked = pickPreferredIngestedFootprint([row])
      if (picked) {
        return {
          ingested: toIngestedFootprintSnapshot(picked),
          matchMethod: 'normalized_address_date',
        }
      }
    }
  }

  return null
}

function emptyResolverIndex(): IngestedFootprintResolverIndex {
  return {
    byId: new Map(),
    bySaleInstanceKey: new Map(),
    bySourceListingId: new Map(),
    aliasByCanonicalUrl: new Map(),
    directByCanonicalUrl: new Map(),
    byNormalizedAddress: new Map(),
  }
}

async function fetchIngestedByIds(
  admin: ReturnType<typeof getAdminDb>,
  ids: string[]
): Promise<IngestedFootprintRow[]> {
  if (ids.length === 0) return []
  const out: IngestedFootprintRow[] = []
  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(INGESTED_FOOTPRINT_SELECT)
      .in('id', chunk)
    if (error) throw new Error(error.message)
    out.push(...((Array.isArray(data) ? data : []) as IngestedFootprintRow[]))
  }
  return out
}

async function fetchIngestedBySaleInstanceKeys(
  admin: ReturnType<typeof getAdminDb>,
  keys: string[]
): Promise<IngestedFootprintRow[]> {
  if (keys.length === 0) return []
  const out: IngestedFootprintRow[] = []
  const chunkSize = 100
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(INGESTED_FOOTPRINT_SELECT)
      .eq('source_platform', 'external_page_source')
      .in('sale_instance_key', chunk)
    if (error) throw new Error(error.message)
    out.push(...((Array.isArray(data) ? data : []) as IngestedFootprintRow[]))
  }
  return out
}

async function fetchIngestedBySourceListingIds(
  admin: ReturnType<typeof getAdminDb>,
  listingIds: string[]
): Promise<IngestedFootprintRow[]> {
  if (listingIds.length === 0) return []
  const out: IngestedFootprintRow[] = []
  const chunkSize = 100
  for (let i = 0; i < listingIds.length; i += chunkSize) {
    const chunk = listingIds.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(INGESTED_FOOTPRINT_SELECT)
      .in('source_listing_id', chunk)
    if (error) throw new Error(error.message)
    out.push(...((Array.isArray(data) ? data : []) as IngestedFootprintRow[]))
  }
  return out
}

async function fetchIngestedBySourceUrls(
  admin: ReturnType<typeof getAdminDb>,
  urls: string[]
): Promise<IngestedFootprintRow[]> {
  if (urls.length === 0) return []
  const out: IngestedFootprintRow[] = []
  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize)
    const [bySourceUrl, byCanonicalUrl] = await Promise.all([
      fromBase(admin, 'ingested_sales').select(INGESTED_FOOTPRINT_SELECT).in('source_url', chunk),
      fromBase(admin, 'ingested_sales')
        .select(INGESTED_FOOTPRINT_SELECT)
        .in('canonical_source_url', chunk),
    ])
    if (bySourceUrl.error) throw new Error(bySourceUrl.error.message)
    if (byCanonicalUrl.error) throw new Error(byCanonicalUrl.error.message)
    out.push(
      ...((Array.isArray(bySourceUrl.data) ? bySourceUrl.data : []) as IngestedFootprintRow[]),
      ...((Array.isArray(byCanonicalUrl.data) ? byCanonicalUrl.data : []) as IngestedFootprintRow[])
    )
  }
  return out
}

async function fetchAliasIngestedRows(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrls: string[]
): Promise<Array<{ canonical_source_url: string; row: IngestedFootprintRow }>> {
  if (canonicalUrls.length === 0) return []
  const out: Array<{ canonical_source_url: string; row: IngestedFootprintRow }> = []
  const chunkSize = 100
  for (let i = 0; i < canonicalUrls.length; i += chunkSize) {
    const chunk = canonicalUrls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sale_source_urls')
      .select('ingested_sale_id, canonical_source_url')
      .in('canonical_source_url', chunk)
    if (error) throw new Error(error.message)

    const aliasRows = (Array.isArray(data) ? data : []) as Array<{
      ingested_sale_id: string
      canonical_source_url: string
    }>
    const ingestedIds = [...new Set(aliasRows.map((r) => String(r.ingested_sale_id)))]
    const ingestedRows = await fetchIngestedByIds(admin, ingestedIds)
    const ingestedById = new Map(ingestedRows.map((row) => [row.id, row]))

    for (const alias of aliasRows) {
      const row = ingestedById.get(String(alias.ingested_sale_id))
      if (!row) continue
      out.push({ canonical_source_url: alias.canonical_source_url, row })
    }
  }
  return out
}

async function fetchIngestedByNormalizedAddresses(
  admin: ReturnType<typeof getAdminDb>,
  addresses: string[]
): Promise<IngestedFootprintRow[]> {
  if (addresses.length === 0) return []
  const out: IngestedFootprintRow[] = []
  const chunkSize = 100
  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(INGESTED_FOOTPRINT_SELECT)
      .in('normalized_address', chunk)
    if (error) throw new Error(error.message)
    out.push(...((Array.isArray(data) ? data : []) as IngestedFootprintRow[]))
  }
  return out
}

/**
 * Batch-load ingested rows for multi-path footprint resolution.
 */
export async function loadIngestedFootprintResolverIndex(
  admin: ReturnType<typeof getAdminDb>,
  observations: readonly ObservationFootprintSourceRow[]
): Promise<IngestedFootprintResolverIndex> {
  const index = emptyResolverIndex()
  if (observations.length === 0) return index

  const saleInstanceKeys = new Set<string>()
  const sourceListingIds = new Set<string>()
  const canonicalUrls = new Set<string>()
  const normalizedAddresses = new Set<string>()
  const matchedIngestedIds = new Set<string>()

  for (const row of observations) {
    const input = buildObservationFootprintInput(row)
    if (input.saleInstanceKey?.trim()) saleInstanceKeys.add(input.saleInstanceKey.trim())
    if (input.sourceListingId?.trim()) sourceListingIds.add(input.sourceListingId.trim())
    canonicalUrls.add(row.canonical_url)
    canonicalUrls.add(canonicalSourceUrl(row.canonical_url))
    if (input.normalizedAddress) normalizedAddresses.add(input.normalizedAddress)
    const matchedId = row.matched_ingested_sale_id?.trim()
    if (matchedId) matchedIngestedIds.add(matchedId)
  }

  const [
    bySaleInstanceKey,
    bySourceListingId,
    bySourceUrls,
    aliasPairs,
    byNormalizedAddress,
    byMatchedIds,
  ] = await Promise.all([
    fetchIngestedBySaleInstanceKeys(admin, [...saleInstanceKeys]),
    fetchIngestedBySourceListingIds(admin, [...sourceListingIds]),
    fetchIngestedBySourceUrls(admin, [...canonicalUrls]),
    fetchAliasIngestedRows(admin, [...canonicalUrls]),
    fetchIngestedByNormalizedAddresses(admin, [...normalizedAddresses]),
    fetchIngestedByIds(admin, [...matchedIngestedIds]),
  ])

  const allRows = new Map<string, IngestedFootprintRow>()
  for (const row of [
    ...bySaleInstanceKey,
    ...bySourceListingId,
    ...bySourceUrls,
    ...byNormalizedAddress,
    ...byMatchedIds,
    ...aliasPairs.map((pair) => pair.row),
  ]) {
    allRows.set(row.id, row)
  }

  for (const row of allRows.values()) {
    registerIngestedRow(index, row)
  }

  for (const row of bySourceUrls) {
    registerDirectUrl(index, row.source_url, row)
    if (row.canonical_source_url) {
      registerDirectUrl(index, row.canonical_source_url, row)
    }
  }

  for (const pair of aliasPairs) {
    registerAliasUrl(index, pair.canonical_source_url, pair.row)
  }

  return index
}
