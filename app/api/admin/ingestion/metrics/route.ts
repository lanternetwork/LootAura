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
  mapToSortedDurationAvg,
  mapToSortedSeries,
  oldestAgeMsFromTimestamp,
  sanitizeStuckRowSample,
  sumLastHourFromSeries,
  type OrchestrationRunRow,
} from '@/lib/admin/ingestionVolumeMetricsHelpers'
import { fetchLastSuccessfulExternalIngestionAt } from '@/lib/ingestion/orchestrationMetrics'
import { ADDRESS_STATUSES } from '@/lib/ingestion/address/addressLifecycleTypes'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

const ORCHESTRATION_RUNS_LIMIT = 2000

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
      .gte('created_at', iso48h)
      .order('created_at', { ascending: false })
      .limit(ORCHESTRATION_RUNS_LIMIT)

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
      lastSuccessfulFetchAt,
      laneStateSummaries,
      discoveryCounts,
      addressStatusParts,
      addressEnrichmentBacklogResult,
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
      lastSuccessfulFetchPromise,
      laneStateSummariesPromise,
      Promise.all(discoveryStatusPromises),
      Promise.all(addressStatusCountPromises),
      addressEnrichmentBacklogPromise,
    ])

    const statusMap = Object.fromEntries(statusParts.map((p) => [p.status, p.count])) as Record<
      (typeof statusTargets)[number],
      number
    >

    const backlog = statusMap.needs_geocode
    if (addressEnrichmentBacklogResult.error) {
      throw new Error(addressEnrichmentBacklogResult.error.message)
    }
    const addressLifecycleMetrics = {
      byStatus: Object.fromEntries(addressStatusParts.map((p) => [p.addressStatus, p.count])),
      enrichmentBacklog: addressEnrichmentBacklogResult.count ?? 0,
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

    const durationMsByHour = mapToSortedDurationAvg(agg.durationSumByHour, agg.durationCountByHour)
    const rate429ByHourSeries = mapToSortedSeries(agg.rate429Hourly)
    const sourcePagesFetchedByHour = mapToSortedSeries(agg.fetchHourly)
    const configsProcessedByHour = mapToSortedSeries(agg.configsProcessedHourly)
    const listingsInsertedByHour = mapToSortedSeries(agg.insertedHourly)
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
      needsGeocodeCount: backlog,
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

    const body: IngestionMetricsResponse = {
      ok: true,
      generatedAt: now.toISOString(),
      backlog,
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
      volume: {
        fetch: {
          crawlableConfigsTotal,
          configsDueForCrawl: crawlSchedule.configsDueForCrawl,
          configsOverdue: crawlSchedule.configsOverdue,
          estimatedFullRotationMinutes: crawlSchedule.estimatedFullRotationMinutes,
          sourcePagesFetched24h: fetchRollup.sourcePagesFetched,
          configsProcessed24h: fetchRollup.configsProcessed,
          listingsDiscovered24h: fetchRollup.listingsDiscovered,
          listingsInserted24h: externalInserted24hResult.count ?? fetchRollup.listingsInserted,
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
        geocode: {
          needsGeocodeCount: backlog,
          oldestNeedsGeocodeAgeMs,
          geocodeSucceeded24h: geocodeRollup.succeeded,
          geocodeRetryableFailed24h: geocodeRollup.retryableFailed,
          geocodeTerminalFailed24h: geocodeRollup.terminalFailed,
          rate429Count24h: geocodeRollup.rate429,
          effectiveConcurrencyLatest: agg.latestGeocodeConcurrency,
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
