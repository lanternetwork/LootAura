import {
  classifyListFastSnapshotCompleteness,
  parseListMetadataSnapshotForAudit,
} from '@/lib/admin/classifyListFastSnapshotForAudit'
import { classifyListFastInsertCollisionDrilldown } from '@/lib/admin/classifyListFastInsertCollisionDrilldown'
import {
  LIST_FAST_GEOCODE_IMPACT_BUCKETS,
  LIST_FAST_PUBLISH_SUPPRESSION_SIGNALS,
  LIST_FAST_SNAPSHOT_COMPLETENESS_BUCKETS,
  type ListFastFailureDistributionAnalysis,
  type ListFastFailureObservationRow,
  type ListFastGeocodeImpactBucket,
  type ListFastIngestedJoinRow,
  type ListFastInsertFailureDetailAnalysis,
  type ListFastPublishSuppressionSignal,
  type ListFastSaleJoinRow,
  type ListFastSnapshotCompletenessBucket,
} from '@/lib/admin/listFastFailureDistributionTypes'
import { parseListFastInsertFailureDetail } from '@/lib/ingestion/ystmCoverage/listFastInsertFailureDiagnosticTypes'
import { isLinkedSaleVisibilityFiltered } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const COHORT_WINDOW_HOURS = 24
const PAGE_SIZE = 500

function emptyCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

function ageHours(attemptedAt: string | null, nowMs: number): number | null {
  if (!attemptedAt) return null
  const ms = Date.parse(attemptedAt)
  if (!Number.isFinite(ms)) return null
  return (nowMs - ms) / (60 * 60 * 1000)
}

async function fetchObservationCohort(
  admin: ReturnType<typeof getAdminDb>,
  outcome: 'failed' | 'ingested',
  cutoffIso: string,
  discoveryPriority: 'hot' | 'hot_warm'
): Promise<ListFastFailureObservationRow[]> {
  const rows: ListFastFailureObservationRow[] = []
  let from = 0

  for (;;) {
    let query = fromBase(admin, 'ystm_coverage_observations')
      .select(
        'canonical_url, missing_ingestion_failure_reason, missing_ingestion_attempted_at, list_metadata_snapshot, sale_instance_key, lootaura_visible, discovery_priority, missing_ingestion_failure_details'
      )
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .not('list_metadata_snapshot', 'is', null)
      .eq('missing_ingestion_outcome', outcome)
      .gte('missing_ingestion_attempted_at', cutoffIso)

    if (discoveryPriority === 'hot') {
      query = query.eq('discovery_priority', 'hot')
    } else {
      query = query.in('discovery_priority', ['hot', 'warm'])
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)

    const chunk = (Array.isArray(data) ? data : []) as ListFastFailureObservationRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function fetchIngestedBySourceUrls(
  admin: ReturnType<typeof getAdminDb>,
  sourceUrls: string[]
): Promise<Map<string, ListFastIngestedJoinRow[]>> {
  const byUrl = new Map<string, ListFastIngestedJoinRow[]>()
  if (sourceUrls.length === 0) return byUrl

  const chunkSize = 100
  for (let i = 0; i < sourceUrls.length; i += chunkSize) {
    const chunk = sourceUrls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, status, published_sale_id, sale_instance_key, address_status, is_duplicate, superseded_by_ingested_sale_id'
      )
      .in('source_url', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as ListFastIngestedJoinRow[]) {
      const url = row.source_url
      const existing = byUrl.get(url) ?? []
      existing.push(row)
      byUrl.set(url, existing)
    }
  }

  return byUrl
}

async function fetchIngestedBySaleInstanceKeys(
  admin: ReturnType<typeof getAdminDb>,
  keys: Array<{ sourcePlatform: string; saleInstanceKey: string }>
): Promise<Map<string, ListFastIngestedJoinRow[]>> {
  const byKey = new Map<string, ListFastIngestedJoinRow[]>()
  if (keys.length === 0) return byKey

  const chunkSize = 50
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize)
    for (const entry of chunk) {
      const { data, error } = await fromBase(admin, 'ingested_sales')
        .select(
          'id, source_url, status, published_sale_id, sale_instance_key, address_status, is_duplicate, superseded_by_ingested_sale_id'
        )
        .eq('source_platform', entry.sourcePlatform)
        .eq('sale_instance_key', entry.saleInstanceKey)
        .is('superseded_by_ingested_sale_id', null)
        .limit(20)

      if (error) throw new Error(error.message)

      const mapKey = `${entry.sourcePlatform}\0${entry.saleInstanceKey}`
      const existing = byKey.get(mapKey) ?? []
      existing.push(...((Array.isArray(data) ? data : []) as ListFastIngestedJoinRow[]))
      byKey.set(mapKey, existing)
    }
  }

  return byKey
}

function emptyInsertFailureDetailAnalysis(): ListFastInsertFailureDetailAnalysis {
  return {
    totalInsertFailed: 0,
    rowsWithInsertDetail: 0,
    byMessageClass: {},
    byConstraint: {},
    sameSourceUrlMatchCount: 0,
    sameInstanceKeyMatchCount: 0,
    sameInstanceKeyDifferentUrlCount: 0,
    publishedMatchCount: 0,
    duplicateMatchCount: 0,
    expiredMatchCount: 0,
    noCollisionMatchCount: 0,
  }
}

async function fetchSalesByIds(
  admin: ReturnType<typeof getAdminDb>,
  saleIds: string[]
): Promise<Map<string, ListFastSaleJoinRow>> {
  const byId = new Map<string, ListFastSaleJoinRow>()
  if (saleIds.length === 0) return byId

  const chunkSize = 100
  for (let i = 0; i < saleIds.length; i += chunkSize) {
    const chunk = saleIds.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'sales')
      .select('id, archived_at, ends_at, moderation_status, status')
      .in('id', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as ListFastSaleJoinRow[]) {
      byId.set(row.id, row)
    }
  }

  return byId
}

function classifyGeocodeImpact(
  failureReason: string | null,
  snapshotHasNativeCoords: boolean
): ListFastGeocodeImpactBucket {
  if (snapshotHasNativeCoords) return 'native_coords_in_snapshot'
  if (failureReason === 'geocode_unavailable') return 'geocode_unavailable_failure'
  if (
    failureReason === 'gated_only' ||
    failureReason === 'missing_dates' ||
    failureReason === 'missing_title' ||
    failureReason === 'expired' ||
    failureReason === 'unparseable_detail'
  ) {
    return 'validity_gated_before_geocode'
  }
  if (failureReason === 'insert_failed') return 'insert_failed_after_geocode'
  return 'other_failure_path'
}

function detectPublishSuppression(input: {
  observation: ListFastFailureObservationRow
  ingestedRows: ListFastIngestedJoinRow[]
  salesById: Map<string, ListFastSaleJoinRow>
  instanceKeyOwners: Map<string, number>
  nowMs: number
}): ListFastPublishSuppressionSignal[] {
  const signals: ListFastPublishSuppressionSignal[] = []
  const { observation, ingestedRows, salesById, instanceKeyOwners, nowMs } = input

  const publishedRow = ingestedRows.find((row) => row.published_sale_id)
  if (publishedRow?.published_sale_id) {
    signals.push('existing_published_sale_linked')
  }

  const obsKey = observation.sale_instance_key?.trim()
  if (obsKey && (instanceKeyOwners.get(obsKey) ?? 0) > 1) {
    signals.push('sale_instance_key_collision')
  }

  let archivedSignal = false
  for (const ingested of ingestedRows) {
    if (ingested.status === 'archived' || ingested.status === 'expired') {
      archivedSignal = true
      break
    }
    if (ingested.published_sale_id) {
      const sale = salesById.get(ingested.published_sale_id)
      if (sale?.archived_at || sale?.status === 'archived') {
        archivedSignal = true
        break
      }
    }
  }
  if (archivedSignal) signals.push('archived_at_not_null')

  for (const ingested of ingestedRows) {
    if (!ingested.published_sale_id) continue
    const sale = salesById.get(ingested.published_sale_id)
    if (!sale) continue
    if (sale.ends_at) {
      const endsMs = Date.parse(sale.ends_at)
      if (Number.isFinite(endsMs) && endsMs <= nowMs) {
        signals.push('ends_at_past')
        break
      }
    }
    if (sale.moderation_status === 'hidden_by_admin') {
      signals.push('moderation_hidden')
      break
    }
    if (isLinkedSaleVisibilityFiltered(sale, nowMs) && ingested.published_sale_id) {
      signals.push('moderation_hidden')
      break
    }
  }

  if (!observation.lootaura_visible && publishedRow?.published_sale_id) {
    signals.push('published_but_observation_stale')
  }

  return signals
}

function buildInstanceKeyOwners(
  failedRows: ListFastFailureObservationRow[],
  ingestedByUrl: Map<string, ListFastIngestedJoinRow[]>
): Map<string, number> {
  const counts = new Map<string, number>()
  const bump = (key: string | null | undefined) => {
    const trimmed = key?.trim()
    if (!trimmed) return
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }

  for (const row of failedRows) bump(row.sale_instance_key)
  for (const rows of ingestedByUrl.values()) {
    for (const ingested of rows) bump(ingested.sale_instance_key)
  }
  return counts
}

/**
 * LIST_FAST_FAILURE_DISTRIBUTION_V1 — read-only scan of hot list-fast failures (24h).
 */
export async function analyzeListFastFailureDistribution(
  now: Date = new Date()
): Promise<ListFastFailureDistributionAnalysis> {
  const admin = getAdminDb()
  const nowMs = now.getTime()
  const cutoffIso = new Date(nowMs - COHORT_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const [failedHotRows, failedHotWarmCountResult, ingestedHotRows, hotQueueResult] = await Promise.all([
    fetchObservationCohort(admin, 'failed', cutoffIso, 'hot'),
    fromBase(admin, 'ystm_coverage_observations')
      .select('canonical_url', { count: 'exact', head: true })
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .not('list_metadata_snapshot', 'is', null)
      .eq('missing_ingestion_outcome', 'failed')
      .in('discovery_priority', ['hot', 'warm'])
      .gte('missing_ingestion_attempted_at', cutoffIso),
    fetchObservationCohort(admin, 'ingested', cutoffIso, 'hot'),
    fromBase(admin, 'ystm_coverage_observations')
      .select('canonical_url', { count: 'exact', head: true })
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('discovery_priority', 'hot'),
  ])

  const canonicalUrls = [
    ...new Set([
      ...failedHotRows.map((row) => row.canonical_url),
      ...ingestedHotRows.map((row) => row.canonical_url),
    ]),
  ]

  const ingestedByUrl = await fetchIngestedBySourceUrls(admin, canonicalUrls)
  const publishedSaleIds = [
    ...new Set(
      [...ingestedByUrl.values()]
        .flat()
        .map((row) => row.published_sale_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const salesById = await fetchSalesByIds(admin, publishedSaleIds)
  const instanceKeyOwners = buildInstanceKeyOwners(failedHotRows, ingestedByUrl)

  const byFailureReason: Record<string, number> = {}
  const bySnapshotCompleteness = emptyCounts(LIST_FAST_SNAPSHOT_COMPLETENESS_BUCKETS)
  const byPublishSuppression = emptyCounts(LIST_FAST_PUBLISH_SUPPRESSION_SIGNALS)
  const byGeocodeImpact = emptyCounts(LIST_FAST_GEOCODE_IMPACT_BUCKETS)

  const ages: number[] = []

  for (const row of failedHotRows) {
    const reason = row.missing_ingestion_failure_reason?.trim() || '(null)'
    increment(byFailureReason, reason)

    const snapshot = parseListMetadataSnapshotForAudit(row.list_metadata_snapshot, row.canonical_url)
    const completeness = classifyListFastSnapshotCompleteness(snapshot)
    bySnapshotCompleteness[completeness as ListFastSnapshotCompletenessBucket] += 1

    const nativeCoords =
      snapshot?.lat != null &&
      snapshot?.lng != null &&
      Number.isFinite(snapshot.lat) &&
      Number.isFinite(snapshot.lng)
    const geocodeBucket = classifyGeocodeImpact(row.missing_ingestion_failure_reason, nativeCoords)
    byGeocodeImpact[geocodeBucket] += 1

    const ingestedRows = ingestedByUrl.get(row.canonical_url) ?? []
    for (const signal of detectPublishSuppression({
      observation: row,
      ingestedRows,
      salesById,
      instanceKeyOwners,
      nowMs,
    })) {
      byPublishSuppression[signal] += 1
    }

    const age = ageHours(row.missing_ingestion_attempted_at, nowMs)
    if (age != null) ages.push(age)
  }

  const ingestedByStatus: Record<string, number> = {}
  let ingestedNeedsGeocodeCount = 0
  let ingestedPublishFailedCount = 0

  for (const row of ingestedHotRows) {
    const ingestedRows = ingestedByUrl.get(row.canonical_url) ?? []
    const primary = ingestedRows[0]
    const status = primary?.status?.trim() || '(no_row)'
    increment(ingestedByStatus, status)
    if (status === 'needs_geocode') ingestedNeedsGeocodeCount += 1
    if (status === 'publish_failed') ingestedPublishFailedCount += 1
  }

  ages.sort((a, b) => a - b)

  const insertFailedRows = failedHotRows.filter(
    (row) => row.missing_ingestion_failure_reason === 'insert_failed'
  )
  const insertFailureDetail = emptyInsertFailureDetailAnalysis()
  insertFailureDetail.totalInsertFailed = insertFailedRows.length

  const instanceKeyLookups = [
    ...new Map(
      insertFailedRows
        .map((row) => row.sale_instance_key?.trim())
        .filter((key): key is string => Boolean(key))
        .map((key) => [`external_page_source\0${key}`, { sourcePlatform: 'external_page_source', saleInstanceKey: key }] as const)
    ).values(),
  ]
  const ingestedByInstanceKey = await fetchIngestedBySaleInstanceKeys(admin, instanceKeyLookups)

  for (const row of insertFailedRows) {
    const detail = parseListFastInsertFailureDetail(row.missing_ingestion_failure_details)
    if (detail) {
      insertFailureDetail.rowsWithInsertDetail += 1
      increment(insertFailureDetail.byMessageClass, detail.messageClass)
      increment(insertFailureDetail.byConstraint, detail.constraint ?? '(null)')
    }

    const sourceMatches = ingestedByUrl.get(row.canonical_url) ?? []
    const saleInstanceKey = row.sale_instance_key?.trim() ?? null
    const instanceMatches =
      saleInstanceKey != null
        ? ingestedByInstanceKey.get(`external_page_source\0${saleInstanceKey}`) ?? []
        : []

    const drilldown = classifyListFastInsertCollisionDrilldown({
      canonicalUrl: row.canonical_url,
      saleInstanceKey,
      sourceUrlMatches: sourceMatches,
      instanceKeyMatches: instanceMatches,
      salesById,
      nowMs,
    })

    if (drilldown.sameSourceUrlMatch) insertFailureDetail.sameSourceUrlMatchCount += 1
    if (drilldown.sameInstanceKeyMatch) insertFailureDetail.sameInstanceKeyMatchCount += 1
    if (drilldown.sameInstanceKeyDifferentUrl) insertFailureDetail.sameInstanceKeyDifferentUrlCount += 1
    if (drilldown.publishedMatch) insertFailureDetail.publishedMatchCount += 1
    if (drilldown.duplicateMatch) insertFailureDetail.duplicateMatchCount += 1
    if (drilldown.expiredMatch) insertFailureDetail.expiredMatchCount += 1
    if (drilldown.noCollisionMatch) insertFailureDetail.noCollisionMatchCount += 1
  }

  return {
    generatedAt: now.toISOString(),
    cohortWindowHours: COHORT_WINDOW_HOURS,
    totalFailedHot24h: failedHotRows.length,
    totalFailedHotWarm24h: failedHotWarmCountResult.count ?? 0,
    totalIngestedHot24h: ingestedHotRows.length,
    hotQueueDepth: hotQueueResult.count ?? 0,
    oldestFailedAgeHours: ages.length > 0 ? ages[ages.length - 1] ?? null : null,
    newestFailedAgeHours: ages.length > 0 ? ages[0] ?? null : null,
    byFailureReason,
    bySnapshotCompleteness,
    byPublishSuppression,
    byGeocodeImpact,
    ingestedByStatus,
    ingestedNeedsGeocodeCount,
    ingestedPublishFailedCount,
    insertFailureDetail,
  }
}
