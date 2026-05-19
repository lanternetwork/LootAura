import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import { extractLatestAdaptiveNoteFromOrchestrationRows } from '@/lib/ingestion/adaptiveThroughputProfile'
import {
  fetchIngestionLaneStateSummaries,
  primaryOrchestrationStateKeyForMetrics,
} from '@/lib/admin/ingestionLaneMetricsHelpers'
import { isIngestionLaneModeEnabled } from '@/lib/ingestion/ingestionLanes'
import {
  parseIngestionOrchestrationConfigBatchSizeForMetrics,
  parseIngestionOrchestrationMinMinutesForMetrics,
  GEOCODE_STALE_CRITICAL_MS,
  PUBLISH_STALE_CRITICAL_MS,
} from '@/lib/admin/ingestionVolumeMetricsConfig'
import {
  METRICS_HOURS,
  aggregateOrchestrationRuns,
  buildEmptyHourBuckets,
  classifyIngestionBottleneck,
  computeCrawlScheduleEstimates,
  computeDuplicateSkipRate,
  computeRate,
  mapToSortedSeries,
  mapToSortedDurationAvg,
  oldestAgeMsFromTimestamp,
  sanitizeStuckRowSample,
  sumLastHourFromSeries,
  type OrchestrationRunRow,
} from '@/lib/admin/ingestionVolumeMetricsHelpers'
import { fetchLastSuccessfulExternalIngestionAt } from '@/lib/ingestion/orchestrationMetrics'
import { countGeocodeDeadLetterReplayBuckets } from '@/lib/geocode/geocodeDeadLetterReplay'
import {
  computeAcquisitionRunRates,
  fetchAcquisitionRegistrySummary,
  mapHourlyRateSeries,
} from '@/lib/admin/acquisitionMetricsHelpers'
import { ADDRESS_STATUSES } from '@/lib/ingestion/address/addressLifecycleTypes'
import type { ImageEnrichmentFailureReason } from '@/lib/ingestion/imageEnrichmentWorker'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  buildIngestionFunnelMetrics,
  FUNNEL_WINDOW_7D,
} from '@/lib/admin/ingestionFunnelMetricsHelpers'
import {
  cohortQueryIsoCutoff,
  fetchDetailFirstMetricsBaselineAt,
} from '@/lib/admin/ingestionMetricsBaseline'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import { fetchFunnelLeaderboardConfigRows } from '@/lib/ingestion/acquisition/configCrawlStats'

export const dynamic = 'force-dynamic'

const ORCHESTRATION_RUNS_LIMIT = 2000
const FUNNEL_COHORT_HOURS = FUNNEL_WINDOW_7D

const IMAGE_ENRICHMENT_FAILURE_REASONS: ImageEnrichmentFailureReason[] = [
  'not_ystm_detail',
  'fetch_failed',
  'fetch_blocked',
  'fetch_rate_limited',
  'not_found',
  'no_media_str',
  'no_valid_urls',
  'max_attempts_exceeded',
]

/** Approximates claim_ingested_sales_for_image_enrichment YSTM detail URL filter. */
const YSTM_DETAIL_SOURCE_URL_FILTER =
  'source_url.ilike.%yardsaletreasuremap%.com/%listing.html%,source_url.ilike.%yardsaletreasuremap%.net/%listing.html%,source_url.ilike.%yardsaletreasuremap%.org/%listing.html%,source_url.ilike.%yardsaletreasuremap%.com/%userlisting.html%,source_url.ilike.%yardsaletreasuremap%.net/%userlisting.html%,source_url.ilike.%yardsaletreasuremap%.org/%userlisting.html%'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

async function fetchAllRows<T extends Record<string, unknown>>(
  admin: ReturnType<typeof getAdminDb>,
  table: string,
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder chain
  filter: (q: any) => any
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const out: T[] = []
  for (;;) {
    const base = filter(fromBase(admin, table).select(select))
    const { data, error } = await base.range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data || []) as T[]
    out.push(...chunk)
    if (chunk.length < pageSize) {
      break
    }
    from += pageSize
  }
  return out
}

async function countExternalDiscoveryStatus(
  admin: ReturnType<typeof getAdminDb>,
  status: string
): Promise<number> {
  const { count, error } = await fromBase(admin, 'ingestion_city_configs')
    .select('city', { count: 'exact', head: true })
    .eq('enabled', true)
    .eq('source_platform', 'external_page_source')
    .eq('source_discovery_status', status)
  if (error) {
    throw new Error(error.message)
  }
  return count ?? 0
}

export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  const admin = getAdminDb()
  const now = new Date()
  const nowMs = now.getTime()
  const iso24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const iso48h = new Date(nowMs - METRICS_HOURS * 60 * 60 * 1000).toISOString()
  try {
    const detailFirstMetricsBaselineAt = await fetchDetailFirstMetricsBaselineAt(admin)
    const isoFunnelCohort = cohortQueryIsoCutoff({
      maxLookbackHours: FUNNEL_COHORT_HOURS,
      nowMs,
      metricsBaselineAt: detailFirstMetricsBaselineAt,
    })
    const isoFunnelOrch = isoFunnelCohort
    const statusTargets = [
      'needs_geocode',
      'needs_check',
      'ready',
      'publishing',
      'published',
      'publish_failed',
      'expired',
      'rejected',
    ] as const

    const statusCountPromises = statusTargets.map(async (status) => {
      const { count, error } = await fromBase(admin, 'ingested_sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
      if (error) {
        throw new Error(error.message)
      }
      return { status, count: count ?? 0 }
    })

    const published24hPromise = fromBase(admin, 'sales')
      .select('id', { count: 'exact', head: true })
      .not('ingested_sale_id', 'is', null)
      .gte('created_at', iso24h)

    const runs24hPromise = fetchAllRows<{ created_count: number | null }>(
      admin,
      'ingestion_runs',
      'created_count',
      (q) => q.gte('started_at', iso24h)
    )

    const geocodeTouchesPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .gte('last_geocode_attempt_at', iso24h)

    const externalInserted24hPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('source_platform', 'external_page_source')
      .gte('created_at', iso24h)

    const oldestNeedsGeocodePromise = fromBase(admin, 'ingested_sales')
      .select('created_at')
      .eq('status', 'needs_geocode')
      .order('created_at', { ascending: true })
      .limit(1)

    const oldestReadyPromise = fromBase(admin, 'ingested_sales')
      .select('updated_at')
      .eq('status', 'ready')
      .order('updated_at', { ascending: true })
      .limit(1)

    const crawlExcludedPromise = fromBase(admin, 'ingestion_city_configs')
      .select('city', { count: 'exact', head: true })
      .eq('enabled', true)
      .eq('source_platform', 'external_page_source')
      .not('source_crawl_excluded_at', 'is', null)

    const orchestrationStateKey = primaryOrchestrationStateKeyForMetrics()
    const orchestrationStatePromise = fromBase(admin, 'ingestion_orchestration_state')
      .select('cursor')
      .eq('key', orchestrationStateKey)
      .limit(1)
    const laneStateSummariesPromise = fetchIngestionLaneStateSummaries(admin)

    const stuckRowsPromise = fromBase(admin, 'ingested_sales')
      .select(
        'id, status, city, state, geocode_attempts, created_at, updated_at, last_geocode_attempt_at'
      )
      .in('status', ['needs_geocode', 'ready', 'publishing', 'publish_failed'])
      .order('updated_at', { ascending: true })
      .limit(20)

    const salesTsPromise = fetchAllRows<{ created_at: string }>(
      admin,
      'sales',
      'created_at',
      (q) => q.not('ingested_sale_id', 'is', null).gte('created_at', iso48h)
    )

    const ingestedPubTsPromise = fetchAllRows<{ published_at: string | null }>(
      admin,
      'ingested_sales',
      'published_at',
      (q) => q.not('published_at', 'is', null).gte('published_at', iso48h)
    )

    const orchestrationRowsPromise = fromBase(admin, 'ingestion_orchestration_runs')
      .select(
        'created_at, mode, duration_ms, batch_size, concurrency, claimed_count, geocode_succeeded_count, failed_retriable_count, failed_terminal_count, publish_attempted_count, publish_succeeded_count, publish_failed_count, publish_expired_count, publish_skipped_count, rate_429_count, notes'
      )
      .gte('created_at', isoFunnelOrch)
      .order('created_at', { ascending: false })
      .limit(ORCHESTRATION_RUNS_LIMIT)

    const funnelConfigRowsPromise = fetchFunnelLeaderboardConfigRows(admin)

    const funnelCohortRowsPromise = fetchAllRows<{
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
    }>(admin, 'ingested_sales', [
      'created_at',
      'source_platform',
      'canonical_source_url',
      'source_url',
      'status',
      'address_status',
      'geocode_method',
      'lat',
      'lng',
      'native_coord_failure_reason',
      'native_coord_attempts',
      'failure_reasons',
      'published_at',
      'is_duplicate',
    ].join(', '), (q) => q.gte('created_at', isoFunnelCohort))

    const lastSuccessfulFetchPromise = fetchLastSuccessfulExternalIngestionAt()

    const discoveryStatusPromises = [
      countExternalDiscoveryStatus(admin, SOURCE_DISCOVERY_STATUS.pending),
      countExternalDiscoveryStatus(admin, SOURCE_DISCOVERY_STATUS.validated),
      countExternalDiscoveryStatus(admin, SOURCE_DISCOVERY_STATUS.failed),
    ] as const

    const addressStatusCountPromises = ADDRESS_STATUSES.map(async (addressStatus) => {
      const { count, error } = await fromBase(admin, 'ingested_sales')
        .select('id', { count: 'exact', head: true })
        .eq('address_status', addressStatus)
      if (error) {
        throw new Error(error.message)
      }
      return { addressStatus, count: count ?? 0 }
    })

    const addressEnrichmentBacklogPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .in('address_status', [
        'address_gated',
        'address_enrichment_pending',
        'address_enrichment_retry',
      ])

    const geocodeEligibleBacklogPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_geocode')
      .eq('address_status', 'address_available')
      .not('address_raw', 'is', null)
      .neq('address_raw', '')

    const imageEnrichmentBacklogPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('address_status', 'address_available')
      .or('image_source_url.is.null,image_source_url.eq.')
      .lt('image_enrichment_attempts', 5)
      .or(YSTM_DETAIL_SOURCE_URL_FILTER)

    const imageHasImagePromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .not('image_source_url', 'is', null)
      .neq('image_source_url', '')

    const imageAttempted24hPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .gte('last_image_enrichment_attempt_at', iso24h)

    const nativeCoordBacklogPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('source_platform', 'external_page_source')
      .is('lat', null)
      .is('lng', null)
      .is('published_sale_id', null)
      .eq('address_status', 'address_available')
      .not('address_raw', 'is', null)
      .neq('address_raw', '')
      .or(YSTM_DETAIL_SOURCE_URL_FILTER)
      .eq('status', 'needs_geocode')

    const nativeCoordClaimEligiblePromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('source_platform', 'external_page_source')
      .is('lat', null)
      .is('lng', null)
      .is('published_sale_id', null)
      .eq('address_status', 'address_available')
      .not('address_raw', 'is', null)
      .neq('address_raw', '')
      .or(YSTM_DETAIL_SOURCE_URL_FILTER)
      .in('status', ['needs_geocode', 'needs_check'])
      .lt('native_coord_attempts', 5)
      .or(
        `native_coord_next_attempt_at.is.null,native_coord_next_attempt_at.lte.${new Date(nowMs).toISOString()}`
      )
      .or('native_coord_failure_reason.is.null,native_coord_failure_reason.not.ilike.terminal_%')

    const nativeCoordPromoted24hPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('geocode_method', 'ystm_provider_native')
      .gte('updated_at', iso24h)

    const nativeCoordFallback24hPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .ilike('native_coord_failure_reason', 'terminal_%')
      .gte('native_coord_last_attempt_at', iso24h)

    const nativeCoordRetry24hPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .not('native_coord_failure_reason', 'is', null)
      .not('native_coord_failure_reason', 'ilike', 'terminal_%')
      .gte('native_coord_last_attempt_at', iso24h)

    const nativeCoordTerminal24hPromise = nativeCoordFallback24hPromise

    const readyFromNative24hPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ready')
      .eq('geocode_method', 'ystm_provider_native')
      .gte('updated_at', iso24h)

    const publishedFromNative24hPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .not('published_sale_id', 'is', null)
      .eq('geocode_method', 'ystm_provider_native')
      .gte('published_at', iso24h)

    const geocodeDeadLetterBucketsPromise = countGeocodeDeadLetterReplayBuckets({ scanCap: 500 })
    const acquisitionRegistryPromise = fetchAcquisitionRegistrySummary(admin, nowMs)

    const imageFailureReasonCountPromises = IMAGE_ENRICHMENT_FAILURE_REASONS.map(
      async (reason) => {
        const { count, error } = await fromBase(admin, 'ingested_sales')
          .select('id', { count: 'exact', head: true })
          .eq('image_enrichment_failure_reason', reason)
        if (error) {
          throw new Error(error.message)
        }
        return { reason, count: count ?? 0 }
      }
    )

    const [
      statusParts,
      published24hResult,
      runs24h,
      geocodeTouchesResult,
      externalInserted24hResult,
      oldestNeedsGeocodeResult,
      oldestReadyResult,
      crawlExcludedResult,
      orchestrationStateResult,
      stuckResult,
      salesTs,
      ingestedPubTs,
      orchestrationRowsResult,
      funnelCohortRows,
      funnelConfigRows,
      lastSuccessfulFetchAt,
      laneStateSummaries,
      discoveryCounts,
      addressStatusParts,
      addressEnrichmentBacklogResult,
      geocodeEligibleBacklogResult,
      imageEnrichmentBacklogResult,
      imageHasImageResult,
      imageAttempted24hResult,
      imageFailureReasonParts,
      nativeCoordBacklogResult,
      nativeCoordClaimEligibleResult,
      nativeCoordPromoted24hResult,
      nativeCoordFallback24hResult,
      nativeCoordRetry24hResult,
      nativeCoordTerminal24hResult,
      readyFromNative24hResult,
      publishedFromNative24hResult,
      geocodeDeadLetterBuckets,
      acquisitionRegistry,
    ] = await Promise.all([
      Promise.all(statusCountPromises),
      published24hPromise,
      runs24hPromise,
      geocodeTouchesPromise,
      externalInserted24hPromise,
      oldestNeedsGeocodePromise,
      oldestReadyPromise,
      crawlExcludedPromise,
      orchestrationStatePromise,
      stuckRowsPromise,
      salesTsPromise,
      ingestedPubTsPromise,
      orchestrationRowsPromise,
      funnelCohortRowsPromise,
      funnelConfigRowsPromise,
      lastSuccessfulFetchPromise,
      laneStateSummariesPromise,
      Promise.all(discoveryStatusPromises),
      Promise.all(addressStatusCountPromises),
      addressEnrichmentBacklogPromise,
      geocodeEligibleBacklogPromise,
      imageEnrichmentBacklogPromise,
      imageHasImagePromise,
      imageAttempted24hPromise,
      Promise.all(imageFailureReasonCountPromises),
      nativeCoordBacklogPromise,
      nativeCoordClaimEligiblePromise,
      nativeCoordPromoted24hPromise,
      nativeCoordFallback24hPromise,
      nativeCoordRetry24hPromise,
      nativeCoordTerminal24hPromise,
      readyFromNative24hPromise,
      publishedFromNative24hPromise,
      geocodeDeadLetterBucketsPromise,
      acquisitionRegistryPromise,
    ])

    const statusMap = Object.fromEntries(statusParts.map((p) => [p.status, p.count])) as Record<
      (typeof statusTargets)[number],
      number
    >

    const backlog = statusMap.needs_geocode
    if (addressEnrichmentBacklogResult.error) {
      throw new Error(addressEnrichmentBacklogResult.error.message)
    }
    if (geocodeEligibleBacklogResult.error) {
      throw new Error(geocodeEligibleBacklogResult.error.message)
    }
    if (imageEnrichmentBacklogResult.error) {
      throw new Error(imageEnrichmentBacklogResult.error.message)
    }
    if (imageHasImageResult.error) {
      throw new Error(imageHasImageResult.error.message)
    }
    if (imageAttempted24hResult.error) {
      throw new Error(imageAttempted24hResult.error.message)
    }
    const geocodeEligibleBacklog = geocodeEligibleBacklogResult.count ?? 0
    const addressLifecycleMetrics = {
      byStatus: Object.fromEntries(addressStatusParts.map((p) => [p.addressStatus, p.count])),
      enrichmentBacklog: addressEnrichmentBacklogResult.count ?? 0,
    }
    const imageEnrichmentMetrics = {
      backlog: imageEnrichmentBacklogResult.count ?? 0,
      hasImage: imageHasImageResult.count ?? 0,
      attempted24h: imageAttempted24hResult.count ?? 0,
      byFailureReason: Object.fromEntries(
        imageFailureReasonParts.map((p) => [p.reason, p.count])
      ),
    }
    if (published24hResult.error) {
      throw new Error(published24hResult.error.message)
    }
    const published24h = published24hResult.count ?? 0

    const claimed24h = runs24h.reduce((a, r) => a + (r.created_count ?? 0), 0)
    if (geocodeTouchesResult.error) {
      throw new Error(geocodeTouchesResult.error.message)
    }
    const geocodeTouches24h = geocodeTouchesResult.count ?? 0

    if (externalInserted24hResult.error) {
      throw new Error(externalInserted24hResult.error.message)
    }

    const efficiency =
      claimed24h > 0 ? Math.round((published24h / claimed24h) * 1000) / 1000 : null

    const failureBreakdown = {
      needs_check: statusMap.needs_check,
      publish_failed: statusMap.publish_failed,
      expired: statusMap.expired,
      ready: statusMap.ready,
      publishing: statusMap.publishing,
    }

    const publishedByHour = buildEmptyHourBuckets(METRICS_HOURS, nowMs)
    for (const row of salesTs) {
      if (!row.created_at) continue
      const d = new Date(row.created_at)
      d.setUTCMinutes(0, 0, 0)
      d.setUTCMilliseconds(0)
      const k = d.toISOString()
      if (publishedByHour.has(k)) {
        publishedByHour.set(k, (publishedByHour.get(k) ?? 0) + 1)
      }
    }

    const ingestedPublishedByHour = buildEmptyHourBuckets(METRICS_HOURS, nowMs)
    for (const row of ingestedPubTs) {
      if (!row.published_at) continue
      const d = new Date(row.published_at)
      d.setUTCMinutes(0, 0, 0)
      d.setUTCMilliseconds(0)
      const k = d.toISOString()
      if (ingestedPublishedByHour.has(k)) {
        ingestedPublishedByHour.set(k, (ingestedPublishedByHour.get(k) ?? 0) + 1)
      }
    }

    if (orchestrationRowsResult.error) {
      throw new Error(orchestrationRowsResult.error.message)
    }
    const orchRows = (orchestrationRowsResult.data || []) as OrchestrationRunRow[]

    const agg = aggregateOrchestrationRuns(orchRows, METRICS_HOURS, nowMs)
    const funnel = buildIngestionFunnelMetrics({
      orchestrationRows: orchRows,
      cohortRows: funnelCohortRows,
      configRows: funnelConfigRows,
      nowMs,
      metricsBaselineAt: detailFirstMetricsBaselineAt,
    })

    const durationMsByHour = mapToSortedDurationAvg(agg.durationSumByHour, agg.durationCountByHour)
    const rate429ByHourSeries = mapToSortedSeries(agg.rate429Hourly)
    const sourcePagesFetchedByHour = mapToSortedSeries(agg.fetchHourly)
    const configsProcessedByHour = mapToSortedSeries(agg.configsProcessedHourly)
    const listingsInsertedByHour = mapToSortedSeries(agg.insertedHourly)
    const listingsSkippedByHour = mapToSortedSeries(agg.listingsSkippedHourly)
    const insertYieldByHour = mapHourlyRateSeries({
      numeratorByHour: agg.insertedHourly,
      denominatorByHour: agg.listingsDiscoveredHourly,
    })
    const saturationRateByHour = mapHourlyRateSeries({
      numeratorByHour: agg.listingsSkippedHourly,
      denominatorByHour: new Map(
        [...agg.listingsDiscoveredHourly.entries()].map(([k, fetched]) => [
          k,
          fetched + (agg.listingsSkippedHourly.get(k) ?? 0),
        ])
      ),
    })
    const publishFailedByHour = mapToSortedSeries(agg.publishFailedHourly)
    const geocodeRetryableFailedByHour = mapToSortedSeries(agg.geocodeRetryableHourly)

    if (stuckResult.error) {
      throw new Error(stuckResult.error.message)
    }
    const stuckRows = stuckResult.data || []

    if (oldestNeedsGeocodeResult.error) {
      throw new Error(oldestNeedsGeocodeResult.error.message)
    }
    if (oldestReadyResult.error) {
      throw new Error(oldestReadyResult.error.message)
    }
    if (crawlExcludedResult.error) {
      throw new Error(crawlExcludedResult.error.message)
    }
    if (orchestrationStateResult.error) {
      throw new Error(orchestrationStateResult.error.message)
    }

    const oldestNeedsGeocodeRow = oldestNeedsGeocodeResult.data?.[0] as { created_at?: string } | undefined
    const oldestReadyRow = oldestReadyResult.data?.[0] as { updated_at?: string } | undefined
    const orchestrationCursor =
      (orchestrationStateResult.data?.[0] as { cursor?: number } | undefined)?.cursor ?? 0

    const crawlableConfigsTotal = agg.latestExternalNote?.configsCrawlable ?? 0
    const crawlSchedule = computeCrawlScheduleEstimates({
      crawlableConfigsTotal,
      orchestrationCursor,
      defaultBatchSize: parseIngestionOrchestrationConfigBatchSizeForMetrics(),
      minIntervalMinutes: parseIngestionOrchestrationMinMinutesForMetrics(),
      lastSuccessfulExternalIngestionAt: lastSuccessfulFetchAt,
      latestCompletedNote: agg.latestExternalNote,
      nowMs,
    })

    const fetchRollup = agg.fetchRollup24h
    const acquisitionRates = computeAcquisitionRunRates({
      fetched24h: fetchRollup.listingsDiscovered,
      inserted24h: fetchRollup.listingsInserted,
      skipped24h: fetchRollup.listingsSkipped,
    })
    const geocodeRollup = agg.geocodeRollup24h
    const publishRollup = agg.publishRollup24h
    const reconRollup = agg.reconciliationRollup24h
    const discoveryRollup = agg.discoveryRollup24h

    const oldestNeedsGeocodeAgeMs = oldestAgeMsFromTimestamp(oldestNeedsGeocodeRow?.created_at, nowMs)
    const oldestReadyAgeMs = oldestAgeMsFromTimestamp(oldestReadyRow?.updated_at, nowMs)

    const candidatePageRpcOkRate24h =
      reconRollup.runCount > 0
        ? computeRate(reconRollup.candidatePageRpcOkCount, reconRollup.runCount)
        : null

    const bottleneck = classifyIngestionBottleneck({
      needsGeocodeCount: geocodeEligibleBacklog,
      readyCount: statusMap.ready,
      oldestNeedsGeocodeAgeMs,
      oldestReadyAgeMs,
      geocodeStaleCriticalMs: GEOCODE_STALE_CRITICAL_MS,
      publishStaleCriticalMs: PUBLISH_STALE_CRITICAL_MS,
      fetchOverdueCount: crawlSchedule.configsOverdue,
      rate429Last24h: geocodeRollup.rate429,
      geocodeRetryableLast24h: geocodeRollup.retryableFailed,
      fetchBudgetExitLast24h: fetchRollup.budgetExitCount,
    })

    const hourlyRates = {
      sourcePagesFetchedPerHour: sumLastHourFromSeries(sourcePagesFetchedByHour, nowMs),
      configsProcessedPerHour: sumLastHourFromSeries(configsProcessedByHour, nowMs),
      listingsDiscoveredPerHour: sumLastHourFromSeries(
        mapToSortedSeries(agg.listingsDiscoveredHourly),
        nowMs
      ),
      listingsInsertedPerHour: sumLastHourFromSeries(listingsInsertedByHour, nowMs),
      listingsSkippedPerHour: sumLastHourFromSeries(listingsSkippedByHour, nowMs),
      insertYieldPerHour: (() => {
        const last = insertYieldByHour[insertYieldByHour.length - 1]
        return last?.value ?? null
      })(),
      saturationRatePerHour: (() => {
        const last = saturationRateByHour[saturationRateByHour.length - 1]
        return last?.value ?? null
      })(),
      geocodeSucceededPerHour: sumLastHourFromSeries(mapToSortedSeries(agg.geocodeSuccessHourly), nowMs),
      geocodeRetryableFailedPerHour: sumLastHourFromSeries(geocodeRetryableFailedByHour, nowMs),
      geocodeTerminalFailedPerHour: sumLastHourFromSeries(
        mapToSortedSeries(agg.geocodeTerminalHourly),
        nowMs
      ),
      publishAttemptedPerHour: sumLastHourFromSeries(mapToSortedSeries(agg.publishAttemptedHourly), nowMs),
      publishSucceededPerHour: sumLastHourFromSeries(mapToSortedSeries(agg.publishSuccessHourly), nowMs),
      publishFailedPerHour: sumLastHourFromSeries(publishFailedByHour, nowMs),
      reconciliationProcessedPerHour: sumLastHourFromSeries(
        mapToSortedSeries(
          (() => {
            const m = buildEmptyHourBuckets(METRICS_HOURS, nowMs)
            for (const row of orchRows) {
              if (row.mode !== 'reconciliation_cron' || !row.created_at) continue
              const r = row.notes?.reconciliation_cron as { processed?: number } | undefined
              const d = new Date(row.created_at)
              d.setUTCMinutes(0, 0, 0)
              d.setUTCMilliseconds(0)
              const k = d.toISOString()
              if (m.has(k)) m.set(k, (m.get(k) ?? 0) + (typeof r?.processed === 'number' ? r.processed : 0))
            }
            return m
          })()
        ),
        nowMs
      ),
    }

    const averageExternalFetchDurationMs =
      fetchRollup.externalFetchDurationSampleCount > 0
        ? Math.round(fetchRollup.externalFetchDurationMsSum / fetchRollup.externalFetchDurationSampleCount)
        : null

    const detailFirstProof = evaluateDetailFirstProofProtocol({
      metricsBaselineAt: detailFirstMetricsBaselineAt,
      detailFirst: funnel['24h'].detailFirst,
    })

    const body: IngestionMetricsResponse = {
      ok: true,
      generatedAt: now.toISOString(),
      detailFirstMetricsBaselineAt,
      detailFirstProof,
      backlog,
      geocodeEligibleBacklog,
      published24h,
      claimed24h,
      geocodeTouches24h,
      efficiency,
      failureBreakdown,
      timeseries: {
        publishedByHour: mapToSortedSeries(publishedByHour),
        ingestedPublishedByHour: mapToSortedSeries(ingestedPublishedByHour),
        durationMsByHour,
        rate429ByHour: rate429ByHourSeries,
        claimedByHour: mapToSortedSeries(agg.claimedHourly),
        geocodeSuccessByHour: mapToSortedSeries(agg.geocodeSuccessHourly),
        publishSuccessByHour: mapToSortedSeries(agg.publishSuccessHourly),
        publishExpiredByHour: mapToSortedSeries(agg.publishExpiredHourly),
        sourcePagesFetchedByHour,
        configsProcessedByHour,
        listingsInsertedByHour,
        listingsSkippedByHour,
        insertYieldByHour,
        saturationRateByHour,
        publishFailedByHour,
        geocodeRetryableFailedByHour,
      },
      orchestrationVisibility: {
        lockSkippedRuns48h: agg.lockSkippedRuns48h,
        budgetExitRuns48h: agg.budgetExitRuns48h,
        overlapPreventionEvents48h: agg.overlapPreventionEvents48h,
        adaptiveLatest: extractLatestAdaptiveNoteFromOrchestrationRows(orchRows),
        laneModeEnabled: isIngestionLaneModeEnabled(),
        lanes: laneStateSummaries,
      },
      funnel,
      volume: {
        acquisition: {
          insertYield24h: acquisitionRates.insertYield24h,
          saturationRate24h: acquisitionRates.saturationRate24h,
          enabledExternalConfigs: acquisitionRegistry.enabledExternalConfigs,
          crawlableConfigs: acquisitionRegistry.crawlableConfigs,
          configsSkippedNoSourcePages: acquisitionRegistry.configsSkippedNoSourcePages,
          configsSkippedInvalidUrls: acquisitionRegistry.configsSkippedInvalidUrls,
          saturatedConfigs: acquisitionRegistry.saturatedConfigs,
          configsWithRecentInsert: acquisitionRegistry.configsWithRecentInsert,
          avgConfigWindowInsertYield: acquisitionRegistry.avgConfigWindowInsertYield,
          pendingDiscoveryConfigs: acquisitionRegistry.pendingDiscoveryConfigs,
          validatedDiscoveryConfigs: acquisitionRegistry.validatedDiscoveryConfigs,
          manualDiscoveryConfigs: acquisitionRegistry.manualDiscoveryConfigs,
          failedDiscoveryConfigs: acquisitionRegistry.failedDiscoveryConfigs,
          discoveryFailureReasons: acquisitionRegistry.discoveryFailureReasons,
        },
        fetch: {
          crawlableConfigsTotal,
          configsDueForCrawl: crawlSchedule.configsDueForCrawl,
          configsOverdue: crawlSchedule.configsOverdue,
          estimatedFullRotationMinutes: crawlSchedule.estimatedFullRotationMinutes,
          sourcePagesFetched24h: fetchRollup.sourcePagesFetched,
          configsProcessed24h: fetchRollup.configsProcessed,
          listingsDiscovered24h: fetchRollup.listingsDiscovered,
          listingsInserted24h: externalInserted24hResult.count ?? fetchRollup.listingsInserted,
          listingsSkipped24h: fetchRollup.listingsSkipped,
          insertYield24h: acquisitionRates.insertYield24h,
          saturationRate24h: acquisitionRates.saturationRate24h,
          duplicateSkipRate: computeDuplicateSkipRate(
            fetchRollup.duplicateSkips,
            fetchRollup.dedupeDenominator
          ),
          parserFailureRate: computeRate(fetchRollup.parserInvalid, fetchRollup.sourcePagesFetched),
          fetchFailureRate: computeRate(fetchRollup.fetchErrors, fetchRollup.fetchDenominator),
          averageExternalFetchDurationMs,
          budgetExitCount24h: fetchRollup.budgetExitCount,
        },
        addressLifecycle: addressLifecycleMetrics,
        imageEnrichment: imageEnrichmentMetrics,
        nativeCoordinateRemediation: {
          nativeCoordBacklog: nativeCoordBacklogResult.count ?? 0,
          nativeCoordClaimEligible: nativeCoordClaimEligibleResult.count ?? 0,
          nativeCoordPromoted24h: nativeCoordPromoted24hResult.count ?? 0,
          nativeCoordFallbackToGeocode24h: nativeCoordFallback24hResult.count ?? 0,
          nativeCoordRetry24h: nativeCoordRetry24hResult.count ?? 0,
          nativeCoordTerminal24h: nativeCoordTerminal24hResult.count ?? 0,
          readyFromNative24h: readyFromNative24hResult.count ?? 0,
          publishedFromNative24h: publishedFromNative24hResult.count ?? 0,
          geocodeProviderAvoided24h: nativeCoordPromoted24hResult.count ?? 0,
        },
        geocode: {
          needsGeocodeCount: backlog,
          eligibleNeedsGeocodeCount: geocodeEligibleBacklog,
          oldestNeedsGeocodeAgeMs,
          geocodeSucceeded24h: geocodeRollup.succeeded,
          geocodeRetryableFailed24h: geocodeRollup.retryableFailed,
          geocodeTerminalFailed24h: geocodeRollup.terminalFailed,
          rate429Count24h: geocodeRollup.rate429,
          effectiveConcurrencyLatest: agg.latestGeocodeConcurrency,
          replayableTransientNeedsCheck: geocodeDeadLetterBuckets.replayableTransientNeedsCheck,
          terminalGeocodeNeedsCheck: geocodeDeadLetterBuckets.terminalGeocodeNeedsCheck,
        },
        publish: {
          readyCount: statusMap.ready,
          oldestReadyAgeMs,
          publishAttempted24h: publishRollup.attempted,
          publishSucceeded24h: publishRollup.succeeded,
          publishFailed24h: publishRollup.failed,
          duplicateReuseCount24h: publishRollup.duplicateReuse,
        },
        discovery: {
          pendingConfigs: discoveryCounts[0],
          validatedConfigs: discoveryCounts[1],
          failedConfigs: discoveryCounts[2],
          crawlExcludedConfigs: crawlExcludedResult.count ?? 0,
          promotedConfigs24h: discoveryRollup.configsPromoted,
          repairedConfigs24h: discoveryRollup.configsRepaired,
        },
        reconciliation: {
          candidatePageRpcOkRate24h,
          candidatesProcessed24h: reconRollup.processed,
          scheduleMutationInhibited24h: reconRollup.scheduleMutationInhibited,
          salesSyncUpdated24h: reconRollup.salesSyncUpdated,
        },
        bottleneck,
        hourlyRates,
      },
      oldestStuckRows: stuckRows.map((r) =>
        sanitizeStuckRowSample({
          id: r.id as string,
          status: r.status as string,
          city: (r.city as string | null) ?? null,
          state: (r.state as string | null) ?? null,
          geocode_attempts: (r.geocode_attempts as number | null) ?? null,
          created_at: r.created_at as string,
          updated_at: r.updated_at as string,
          last_geocode_attempt_at: (r.last_geocode_attempt_at as string | null) ?? null,
        })
      ),
    }

    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('admin ingestion metrics failed', err instanceof Error ? err : new Error(message), {
      component: 'api/admin/ingestion/metrics',
    })
    return jsonError(500, 'METRICS_FAILED', message)
  }
}
