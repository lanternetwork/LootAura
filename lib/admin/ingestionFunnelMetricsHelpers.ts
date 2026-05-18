/**
 * Pure helpers for ingestion funnel accounting (crawler + DB cohort, no estimates).
 */

import type { DedupeDecisionAggregate } from '@/lib/ingestion/dedupe'
import type { ExternalIngestionOrchestrationNote } from '@/lib/ingestion/orchestrationMetrics'
import {
  buildConfigYieldLeaderboards,
  summarizeFreshAcquisitionRates,
} from '@/lib/admin/configYieldLeaderboards'
import type { ConfigCrawlStatsSnapshot } from '@/lib/ingestion/acquisition/configCrawlStats'
import {
  dedupeDenominatorFromAggregate,
  dedupeSkipCountFromAggregate,
  computeRate,
  hourFloorUtc,
  type HourCountSeries,
  type OrchestrationRunRow,
} from '@/lib/admin/ingestionVolumeMetricsHelpers'

export const FUNNEL_WINDOW_24H = 24
export const FUNNEL_WINDOW_7D = 24 * 7

export type IngestionFunnelStageId =
  | 'discovered'
  | 'duplicate_skipped'
  | 'skipped_expired'
  | 'fresh_inserted'
  | 'inserted'
  | 'expired_at_insert'
  | 'invalid_address'
  | 'address_gated'
  | 'native_coord_found'
  | 'native_coord_failed'
  | 'geocode_success'
  | 'geocode_failed'
  | 'ready'
  | 'published'
  | 'publish_failed'

export type IngestionFunnelLayer = 'crawler' | 'unique_listings' | 'publishable'

export type IngestionFunnelStage = {
  id: IngestionFunnelStageId
  label: string
  layer: IngestionFunnelLayer
  count: number
  conversionFromPrevious: number | null
  conversionFromInserted: number | null
  dropoffFromPrevious: number
}

export type IngestionFunnelDuplicateHits = {
  source_url: number
  exact_address_date: number
  soft_date_window: number
  duplicate_decision_true: number
  duplicate_existing_url: number
  duplicate_cross_city_page: number
  duplicate_canonical_collision: number
  duplicate_expired_row: number
  total: number
}

export type IngestionFunnelReconciliation = {
  crawlerDiscovered: number
  crawlerInserted: number
  crawlerSkipped: number
  crawlerInvalid: number
  crawlerOutbound: number
  crawlerDelta: number
  crawlerReconciles: boolean
  dbInserted: number
  dbOrchestrationInsertedDelta: number
  cohortPartitionSum: number
  cohortMatchesInserted: boolean
}

export type IngestionFunnelTopDropoff = {
  fromStageId: IngestionFunnelStageId
  toStageId: IngestionFunnelStageId
  count: number
  rate: number | null
}

export type IngestionFunnelPlatformBreakdown = {
  discovered: number
  duplicate_skipped: number
  inserted: number
  published: number
  uniqueCanonicalUrls: number
}

export type IngestionFunnelFreshRates = {
  freshInsertYield: number | null
  expiredDiscoveryRatio: number | null
  expiredInsertRatio: number | null
}

export type IngestionFunnelDetailFirstMetrics = {
  attempted: number
  succeeded: number
  published: number
  fallback: number
  fetchFailed: number
  freshInsertReadyAtInsertRate: number | null
  medianMsToPublished: number | null
  providerGeocodeBypassRate: number | null
}

export type ConfigYieldLeaderboardEntry = {
  city: string
  state: string
  windowFetched: number
  windowSkippedExpired: number
  windowFreshInserted: number
  windowDupSkips: number
  freshInsertYield: number | null
  expiredDiscoveryRatio: number | null
  skipRatio: number | null
}

export type IngestionFunnelWindowMetrics = {
  windowHours: number
  stages: IngestionFunnelStage[]
  topDropoff: IngestionFunnelTopDropoff | null
  reconciliation: IngestionFunnelReconciliation
  uniqueCanonicalUrls: number
  duplicateHits: IngestionFunnelDuplicateHits
  freshRates: IngestionFunnelFreshRates
  skippedExpired: number
  freshInserted: number
  detailFirst: IngestionFunnelDetailFirstMetrics
  configLeaderboards: {
    topFreshYield: ConfigYieldLeaderboardEntry[]
    topStale: ConfigYieldLeaderboardEntry[]
    topDuplicate: ConfigYieldLeaderboardEntry[]
  }
  bySourcePlatform: Record<string, IngestionFunnelPlatformBreakdown>
  ystm: IngestionFunnelPlatformBreakdown
  sparklines: {
    discoveredByHour: HourCountSeries
    insertedByHour: HourCountSeries
    publishedByHour: HourCountSeries
  }
}

export type IngestedSaleFunnelRow = {
  created_at: string
  source_platform: string | null
  canonical_source_url: string | null
  source_url: string | null
  status: string
  address_status: string | null
  geocode_method: string | null
  lat: number | null
  lng: number | null
  native_coord_failure_reason: string | null
  native_coord_attempts: number | null
  failure_reasons: unknown
  published_at: string | null
  is_duplicate: boolean | null
}

export type ExternalIngestionRollup = {
  listingsDiscovered: number
  listingsInserted: number
  listingsSkipped: number
  skippedExpired: number
  freshInserted: number
  parserInvalid: number
  duplicateSkips: number
  dedupeDenominator: number
  duplicateHits: IngestionFunnelDuplicateHits
  discoveredByHour: Map<string, number>
  insertedByHour: Map<string, number>
  skippedByHour: Map<string, number>
  detailFirstAttempted: number
  detailFirstSucceeded: number
  detailFirstPublished: number
  detailFirstFallback: number
  detailFirstFetchFailed: number
  detailFirstMsToPublishedSamples: number[]
}

function recomputeDuplicateHitsTotal(target: IngestionFunnelDuplicateHits): void {
  target.total =
    target.source_url +
    target.exact_address_date +
    target.soft_date_window +
    target.duplicate_decision_true +
    target.duplicate_existing_url +
    target.duplicate_cross_city_page +
    target.duplicate_canonical_collision +
    target.duplicate_expired_row
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function asExternalNote(notes: Record<string, unknown> | null): ExternalIngestionOrchestrationNote | null {
  if (!notes || typeof notes !== 'object') return null
  const ext = notes.external_ingestion
  if (!ext || typeof ext !== 'object') return null
  return ext as ExternalIngestionOrchestrationNote
}

function failureReasonList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is string => typeof r === 'string')
}

export function isYstmDetailListingRow(row: Pick<IngestedSaleFunnelRow, 'source_url' | 'source_platform'>): boolean {
  if (row.source_platform !== 'external_page_source') return false
  const url = row.source_url ?? ''
  return /yardsaletreasuremap\.(com|net|org)\//i.test(url) && /listing\.html|userlisting\.html/i.test(url)
}

export function hasCoordinates(row: Pick<IngestedSaleFunnelRow, 'lat' | 'lng'>): boolean {
  return row.lat != null && row.lng != null && Number.isFinite(row.lat) && Number.isFinite(row.lng)
}

export function hasInvalidAddress(row: IngestedSaleFunnelRow): boolean {
  if (row.address_status === 'address_unavailable_terminal') return true
  const reasons = failureReasonList(row.failure_reasons)
  return reasons.includes('missing_address') || reasons.includes('invalid_address_format')
}

export function hasExpiredAtInsert(row: IngestedSaleFunnelRow): boolean {
  if (row.status === 'expired') return true
  return failureReasonList(row.failure_reasons).includes('sale_expired')
}

export function hasNativeCoordFound(row: IngestedSaleFunnelRow): boolean {
  return row.geocode_method === 'ystm_provider_native' && hasCoordinates(row)
}

export function hasNativeCoordFailed(row: IngestedSaleFunnelRow): boolean {
  const reason = row.native_coord_failure_reason ?? ''
  if (reason.toLowerCase().startsWith('terminal_')) return true
  const attempts = row.native_coord_attempts ?? 0
  return attempts >= 5 && !hasCoordinates(row) && isYstmDetailListingRow(row)
}

export function hasGeocodeFailed(row: IngestedSaleFunnelRow): boolean {
  if (hasCoordinates(row)) return false
  const reasons = failureReasonList(row.failure_reasons)
  if (reasons.includes('geocode_failed')) return true
  if (row.status === 'needs_check' && reasons.some((r) => r.includes('geocode'))) return true
  if (row.status === 'needs_geocode' && (row.geocode_method ?? '').includes('dead')) return true
  return false
}

export function hasGeocodeSuccess(row: IngestedSaleFunnelRow): boolean {
  if (!hasCoordinates(row)) return false
  if (row.geocode_method === 'ystm_provider_native') return true
  const method = row.geocode_method ?? ''
  return method.length > 0 && method !== 'ystm_provider_native'
}

export type CohortPartition =
  | 'published'
  | 'publish_failed'
  | 'expired_at_insert'
  | 'ready'
  | 'geocode_failed'
  | 'native_coord_failed'
  | 'address_gated'
  | 'invalid_address'
  | 'native_coord_found_pending'
  | 'geocode_success_pending'
  | 'in_pipeline'

export function partitionCohortRow(row: IngestedSaleFunnelRow): CohortPartition {
  if (row.status === 'published' || row.published_at != null) return 'published'
  if (row.status === 'publish_failed') return 'publish_failed'
  if (hasExpiredAtInsert(row)) return 'expired_at_insert'
  if (row.status === 'ready' || row.status === 'publishing') return 'ready'
  if (hasInvalidAddress(row)) return 'invalid_address'
  if (row.address_status === 'address_gated') return 'address_gated'
  if (hasNativeCoordFailed(row)) return 'native_coord_failed'
  if (hasGeocodeFailed(row)) return 'geocode_failed'
  if (hasNativeCoordFound(row)) return 'native_coord_found_pending'
  if (hasGeocodeSuccess(row)) return 'geocode_success_pending'
  return 'in_pipeline'
}

export function emptyDuplicateHits(): IngestionFunnelDuplicateHits {
  return {
    source_url: 0,
    exact_address_date: 0,
    soft_date_window: 0,
    duplicate_decision_true: 0,
    duplicate_existing_url: 0,
    duplicate_cross_city_page: 0,
    duplicate_canonical_collision: 0,
    duplicate_expired_row: 0,
    total: 0,
  }
}

export function accumulateDuplicateHits(
  target: IngestionFunnelDuplicateHits,
  agg: DedupeDecisionAggregate | undefined
): IngestionFunnelDuplicateHits {
  if (!agg) return target
  target.source_url += num(agg.source_url)
  target.exact_address_date += num(agg.exact_address_date)
  target.soft_date_window += num(agg.soft_date_window)
  target.duplicate_decision_true += num(agg.duplicateDecisionTrue)
  recomputeDuplicateHitsTotal(target)
  return target
}

export function accumulateClassifiedDuplicateHits(
  target: IngestionFunnelDuplicateHits,
  ext: {
    duplicateExistingUrl?: number
    duplicateCrossCityPage?: number
    duplicateCanonicalCollision?: number
    duplicateExpiredRow?: number
  }
): IngestionFunnelDuplicateHits {
  target.duplicate_existing_url += num(ext.duplicateExistingUrl)
  target.duplicate_cross_city_page += num(ext.duplicateCrossCityPage)
  target.duplicate_canonical_collision += num(ext.duplicateCanonicalCollision)
  target.duplicate_expired_row += num(ext.duplicateExpiredRow)
  recomputeDuplicateHitsTotal(target)
  return target
}

export function rollupExternalIngestionForWindow(
  rows: OrchestrationRunRow[],
  windowHours: number,
  nowMs = Date.now()
): ExternalIngestionRollup {
  const isoCutoff = new Date(nowMs - windowHours * 60 * 60 * 1000).toISOString()
  const discoveredByHour = new Map<string, number>()
  const insertedByHour = new Map<string, number>()
  const skippedByHour = new Map<string, number>()

  const rollup: ExternalIngestionRollup = {
    listingsDiscovered: 0,
    listingsInserted: 0,
    listingsSkipped: 0,
    skippedExpired: 0,
    freshInserted: 0,
    parserInvalid: 0,
    duplicateSkips: 0,
    dedupeDenominator: 0,
    duplicateHits: emptyDuplicateHits(),
    discoveredByHour,
    insertedByHour,
    skippedByHour,
    detailFirstAttempted: 0,
    detailFirstSucceeded: 0,
    detailFirstPublished: 0,
    detailFirstFallback: 0,
    detailFirstFetchFailed: 0,
    detailFirstMsToPublishedSamples: [],
  }

  for (const row of rows) {
    if (!row.created_at || row.created_at < isoCutoff) continue
    if (row.mode !== 'daily' && row.mode !== 'ingestion') continue
    const ext = asExternalNote(row.notes)
    if (!ext || ext.status !== 'completed') continue

    const fetched = num(ext.fetched)
    const inserted = num(ext.inserted)
    const skipped = num(ext.skipped)
    const invalid = num(ext.invalid)

    rollup.listingsDiscovered += fetched
    rollup.listingsInserted += inserted
    rollup.listingsSkipped += skipped
    rollup.skippedExpired += num(ext.skippedExpired)
    rollup.freshInserted += num(ext.freshInserted)
    rollup.parserInvalid += invalid

    const agg = ext.dedupeTelemetrySummary
    rollup.duplicateSkips += dedupeSkipCountFromAggregate(agg)
    rollup.dedupeDenominator += dedupeDenominatorFromAggregate(agg)
    accumulateDuplicateHits(rollup.duplicateHits, agg)
    accumulateClassifiedDuplicateHits(rollup.duplicateHits, {
      duplicateExistingUrl: ext.duplicateExistingUrl,
      duplicateCrossCityPage: ext.duplicateCrossCityPage,
      duplicateCanonicalCollision: ext.duplicateCanonicalCollision,
      duplicateExpiredRow: ext.duplicateExpiredRow,
    })

    rollup.detailFirstAttempted += num(ext.ystmDetailFirstAttempted)
    rollup.detailFirstSucceeded += num(ext.ystmDetailFirstSucceeded)
    rollup.detailFirstPublished += num(ext.ystmDetailFirstPublished)
    rollup.detailFirstFallback += num(ext.ystmDetailFirstFallback)
    rollup.detailFirstFetchFailed += num(ext.ystmDetailFirstFetchFailed)
    if (ext.medianMsToPublished != null && Number.isFinite(ext.medianMsToPublished)) {
      rollup.detailFirstMsToPublishedSamples.push(ext.medianMsToPublished)
    }

    const k = hourFloorUtc(row.created_at)
    discoveredByHour.set(k, (discoveredByHour.get(k) ?? 0) + fetched)
    insertedByHour.set(k, (insertedByHour.get(k) ?? 0) + inserted)
    skippedByHour.set(k, (skippedByHour.get(k) ?? 0) + skipped)
  }

  return rollup
}

function initPlatformBreakdown(): IngestionFunnelPlatformBreakdown {
  return {
    discovered: 0,
    duplicate_skipped: 0,
    inserted: 0,
    published: 0,
    uniqueCanonicalUrls: 0,
  }
}

export type CohortFunnelAggregate = {
  inserted: number
  uniqueCanonicalUrls: number
  partition: Record<CohortPartition, number>
  reach: {
    expired_at_insert: number
    invalid_address: number
    address_gated: number
    native_coord_found: number
    native_coord_failed: number
    geocode_success: number
    geocode_failed: number
    ready: number
    published: number
    publish_failed: number
  }
  bySourcePlatform: Record<string, IngestionFunnelPlatformBreakdown>
  ystm: IngestionFunnelPlatformBreakdown
  publishedByHour: Map<string, number>
}

export function aggregateCohortFunnel(
  rows: IngestedSaleFunnelRow[],
  windowHours: number,
  nowMs = Date.now()
): CohortFunnelAggregate {
  const isoCutoff = new Date(nowMs - windowHours * 60 * 60 * 1000).toISOString()
  const partition: Record<CohortPartition, number> = {
    published: 0,
    publish_failed: 0,
    expired_at_insert: 0,
    ready: 0,
    geocode_failed: 0,
    native_coord_failed: 0,
    address_gated: 0,
    invalid_address: 0,
    native_coord_found_pending: 0,
    geocode_success_pending: 0,
    in_pipeline: 0,
  }

  const bySourcePlatform: Record<string, IngestionFunnelPlatformBreakdown> = {}
  const ystm = initPlatformBreakdown()
  const publishedByHour = new Map<string, number>()
  const canonicalByPlatform = new Map<string, Set<string>>()
  const canonicalGlobal = new Set<string>()
  const canonicalYstm = new Set<string>()

  let inserted = 0
  const reach = {
    expired_at_insert: 0,
    invalid_address: 0,
    address_gated: 0,
    native_coord_found: 0,
    native_coord_failed: 0,
    geocode_success: 0,
    geocode_failed: 0,
    ready: 0,
    published: 0,
    publish_failed: 0,
  }

  for (const row of rows) {
    if (!row.created_at || row.created_at < isoCutoff) continue
    if (row.is_duplicate === true) continue

    inserted += 1
    const platform = row.source_platform ?? 'unknown'
    if (!bySourcePlatform[platform]) {
      bySourcePlatform[platform] = initPlatformBreakdown()
    }
    bySourcePlatform[platform].inserted += 1

    const canonical = row.canonical_source_url ?? row.source_url
    if (canonical) {
      canonicalGlobal.add(canonical)
      if (!canonicalByPlatform.has(platform)) canonicalByPlatform.set(platform, new Set())
      canonicalByPlatform.get(platform)!.add(canonical)
    }

    const part = partitionCohortRow(row)
    partition[part] += 1

    if (hasExpiredAtInsert(row)) reach.expired_at_insert += 1
    if (hasInvalidAddress(row)) reach.invalid_address += 1
    if (row.address_status === 'address_gated') reach.address_gated += 1
    if (hasNativeCoordFound(row)) reach.native_coord_found += 1
    if (hasNativeCoordFailed(row)) reach.native_coord_failed += 1
    if (hasGeocodeSuccess(row)) reach.geocode_success += 1
    if (hasGeocodeFailed(row)) reach.geocode_failed += 1
    if (row.status === 'ready' || row.status === 'publishing') reach.ready += 1
    if (row.status === 'publish_failed') reach.publish_failed += 1
    if (row.status === 'published' || row.published_at != null) {
      reach.published += 1
      bySourcePlatform[platform].published += 1
      if (row.published_at) {
        const k = hourFloorUtc(row.published_at)
        publishedByHour.set(k, (publishedByHour.get(k) ?? 0) + 1)
      }
    }

    if (isYstmDetailListingRow(row)) {
      ystm.inserted += 1
      if (canonical) canonicalYstm.add(canonical)
      if (row.status === 'published' || row.published_at != null) ystm.published += 1
    }
  }

  for (const [platform, set] of canonicalByPlatform) {
    bySourcePlatform[platform].uniqueCanonicalUrls = set.size
  }
  ystm.uniqueCanonicalUrls = canonicalYstm.size

  return {
    inserted,
    uniqueCanonicalUrls: canonicalGlobal.size,
    partition,
    reach,
    bySourcePlatform,
    ystm,
    publishedByHour,
  }
}

const LOSS_STAGE_IDS = new Set<IngestionFunnelStageId>([
  'duplicate_skipped',
  'skipped_expired',
  'expired_at_insert',
  'invalid_address',
  'address_gated',
  'native_coord_failed',
  'geocode_failed',
  'publish_failed',
])

function buildStage(
  id: IngestionFunnelStageId,
  label: string,
  layer: IngestionFunnelLayer,
  count: number,
  previousCount: number | null,
  insertedBaseline: number
): IngestionFunnelStage {
  const prev = previousCount ?? 0
  const isLoss = LOSS_STAGE_IDS.has(id)
  const dropoffFromPrevious = previousCount == null ? 0 : isLoss ? count : Math.max(0, prev - count)
  const conversionFromPrevious = isLoss ? computeRate(count, prev) : computeRate(count, prev)

  return {
    id,
    label,
    layer,
    count,
    conversionFromPrevious,
    conversionFromInserted:
      layer === 'crawler' || id === 'inserted' ? null : computeRate(count, insertedBaseline),
    dropoffFromPrevious,
  }
}

export function computeTopDropoff(stages: IngestionFunnelStage[]): IngestionFunnelTopDropoff | null {
  let best: IngestionFunnelTopDropoff | null = null
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1]!
    const cur = stages[i]!
    const count = cur.dropoffFromPrevious
    if (count <= 0) continue
    if (!best || count > best.count) {
      best = {
        fromStageId: prev.id,
        toStageId: cur.id,
        count,
        rate: computeRate(count, prev.count),
      }
    }
  }
  return best
}

export function buildIngestionFunnelWindowMetrics(params: {
  windowHours: number
  externalRollup: ExternalIngestionRollup
  cohort: CohortFunnelAggregate
  configRows?: ConfigCrawlStatsSnapshot[]
  nowMs?: number
}): IngestionFunnelWindowMetrics {
  const { windowHours, externalRollup, cohort, configRows = [], nowMs = Date.now() } = params
  const discovered = externalRollup.listingsDiscovered
  const duplicateSkipped = externalRollup.listingsSkipped + externalRollup.duplicateSkips
  const skippedExpired = externalRollup.skippedExpired
  const freshInserted = externalRollup.freshInserted
  const inserted = cohort.inserted
  const orchInserted = externalRollup.listingsInserted

  const partition = cohort.partition
  const reach = cohort.reach

  const stages: IngestionFunnelStage[] = []
  let prev: number | null = null

  const push = (id: IngestionFunnelStageId, label: string, layer: IngestionFunnelLayer, count: number) => {
    stages.push(buildStage(id, label, layer, count, prev, inserted))
    prev = count
  }

  push('discovered', 'Discovered / fetched', 'crawler', discovered)
  push('duplicate_skipped', 'Duplicate / skipped', 'crawler', duplicateSkipped)
  push('skipped_expired', 'Skipped expired (at discovery)', 'crawler', skippedExpired)
  push('fresh_inserted', 'Fresh inserted (non-expired)', 'unique_listings', freshInserted)
  push('inserted', 'Inserted (unique rows, DB cohort)', 'unique_listings', inserted)
  push('expired_at_insert', 'Expired (past date)', 'publishable', reach.expired_at_insert)
  push('invalid_address', 'Invalid address', 'publishable', reach.invalid_address)
  push('address_gated', 'Address gated', 'publishable', reach.address_gated)
  push('native_coord_found', 'Native coord found', 'publishable', reach.native_coord_found)
  push('native_coord_failed', 'Native coord failed', 'publishable', reach.native_coord_failed)
  push('geocode_success', 'Geocode success', 'publishable', reach.geocode_success)
  push('geocode_failed', 'Geocode failed', 'publishable', reach.geocode_failed)
  push('ready', 'Ready to publish', 'publishable', reach.ready)
  push('published', 'Published', 'publishable', reach.published)
  push('publish_failed', 'Publish failed', 'publishable', reach.publish_failed)

  const crawlerOutbound =
    externalRollup.listingsInserted + externalRollup.listingsSkipped + externalRollup.parserInvalid
  const crawlerDelta = discovered - crawlerOutbound
  const cohortPartitionSum = Object.values(partition).reduce((a, b) => a + b, 0)

  const reconciliation: IngestionFunnelReconciliation = {
    crawlerDiscovered: discovered,
    crawlerInserted: orchInserted,
    crawlerSkipped: externalRollup.listingsSkipped,
    crawlerInvalid: externalRollup.parserInvalid,
    crawlerOutbound,
    crawlerDelta,
    crawlerReconciles: crawlerDelta === 0,
    dbInserted: inserted,
    dbOrchestrationInsertedDelta: inserted - orchInserted,
    cohortPartitionSum,
    cohortMatchesInserted: cohortPartitionSum === inserted,
  }

  for (const platform of Object.keys(cohort.bySourcePlatform)) {
    cohort.bySourcePlatform[platform]!.discovered = 0
    cohort.bySourcePlatform[platform]!.duplicate_skipped = 0
  }
  cohort.ystm.discovered = discovered
  cohort.ystm.duplicate_skipped = duplicateSkipped

  const freshRates = summarizeFreshAcquisitionRates({
    discovered,
    skippedExpired,
    freshInserted,
    cohortInserted: inserted,
    cohortExpiredAtInsert: reach.expired_at_insert,
  })

  const detailFirstMsSamples = externalRollup.detailFirstMsToPublishedSamples
  let detailFirstMedianMsToPublished: number | null = null
  if (detailFirstMsSamples.length > 0) {
    const sorted = [...detailFirstMsSamples].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    detailFirstMedianMsToPublished =
      sorted.length % 2 === 1
        ? sorted[mid]!
        : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
  }

  const detailFirstAttempted = externalRollup.detailFirstAttempted
  const detailFirstSucceeded = externalRollup.detailFirstSucceeded
  const detailFirstPublished = externalRollup.detailFirstPublished
  const detailFirst: IngestionFunnelDetailFirstMetrics = {
    attempted: detailFirstAttempted,
    succeeded: detailFirstSucceeded,
    published: detailFirstPublished,
    fallback: externalRollup.detailFirstFallback,
    fetchFailed: externalRollup.detailFirstFetchFailed,
    freshInsertReadyAtInsertRate:
      freshInserted > 0 ? Math.round((detailFirstSucceeded / freshInserted) * 10000) / 10000 : null,
    medianMsToPublished: detailFirstMedianMsToPublished,
    providerGeocodeBypassRate:
      detailFirstAttempted > 0
        ? Math.round((detailFirstSucceeded / detailFirstAttempted) * 10000) / 10000
        : null,
  }

  return {
    windowHours,
    stages,
    topDropoff: computeTopDropoff(stages),
    reconciliation,
    uniqueCanonicalUrls: cohort.uniqueCanonicalUrls,
    duplicateHits: externalRollup.duplicateHits,
    freshRates,
    skippedExpired,
    freshInserted,
    detailFirst,
    configLeaderboards: buildConfigYieldLeaderboards(configRows, nowMs),
    bySourcePlatform: cohort.bySourcePlatform,
    ystm: cohort.ystm,
    sparklines: {
      discoveredByHour: [...externalRollup.discoveredByHour.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bucket, count]) => ({ bucket, count })),
      insertedByHour: [...externalRollup.insertedByHour.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bucket, count]) => ({ bucket, count })),
      publishedByHour: [...cohort.publishedByHour.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bucket, count]) => ({ bucket, count })),
    },
  }
}

export function buildIngestionFunnelMetrics(params: {
  orchestrationRows: OrchestrationRunRow[]
  cohortRows: IngestedSaleFunnelRow[]
  configRows?: ConfigCrawlStatsSnapshot[]
  nowMs?: number
}): { '24h': IngestionFunnelWindowMetrics; '7d': IngestionFunnelWindowMetrics } {
  const nowMs = params.nowMs ?? Date.now()
  const build = (windowHours: number) =>
    buildIngestionFunnelWindowMetrics({
      windowHours,
      externalRollup: rollupExternalIngestionForWindow(params.orchestrationRows, windowHours, nowMs),
      cohort: aggregateCohortFunnel(params.cohortRows, windowHours, nowMs),
      configRows: params.configRows,
      nowMs,
    })

  return {
    '24h': build(FUNNEL_WINDOW_24H),
    '7d': build(FUNNEL_WINDOW_7D),
  }
}
