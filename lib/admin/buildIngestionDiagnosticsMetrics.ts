import { analyzeAddressEnrichmentDrainCohort } from '@/lib/admin/analyzeAddressEnrichmentDrainCohort'
import { analyzeListFastFailureDistribution } from '@/lib/admin/analyzeListFastFailureDistribution'
import { analyzeNeedsCheckRootCause } from '@/lib/admin/analyzeNeedsCheckRootCause'
import { analyzePublishedNotVisibleDistribution } from '@/lib/admin/analyzePublishedNotVisibleDistribution'
import { countNeedsCheckBreakdown } from '@/lib/admin/countNeedsCheckBreakdown'
import {
  buildIngestionFunnelMetrics,
  FUNNEL_WINDOW_7D,
} from '@/lib/admin/ingestionFunnelMetricsHelpers'
import {
  cohortQueryIsoCutoff,
  fetchDetailFirstMetricsBaselineAt,
} from '@/lib/admin/ingestionMetricsBaseline'
import type { IngestionMetricsDiagnosticsResponse } from '@/lib/admin/ingestionMetricsTypes'
import { fetchFunnelLeaderboardConfigRows } from '@/lib/ingestion/acquisition/configCrawlStats'
import { evaluateDetailFirstProofProtocol } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import { countGeocodeDeadLetterReplayBuckets } from '@/lib/geocode/geocodeDeadLetterReplay'
import type { OrchestrationRunRow } from '@/lib/admin/ingestionVolumeMetricsHelpers'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

const ORCHESTRATION_RUNS_LIMIT = 2000
const FUNNEL_COHORT_HOURS = FUNNEL_WINDOW_7D

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

type FunnelCohortRow = {
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

const FUNNEL_COHORT_SELECT = [
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
].join(', ')

/**
 * Expensive ingestion diagnostics — funnel cohort, needs_check scans, dead-letter buckets.
 * Not used on SEO paths or core dashboard polling.
 */
export async function buildIngestionDiagnosticsMetricsResponse(): Promise<IngestionMetricsDiagnosticsResponse> {
  const admin = getAdminDb()
  const now = new Date()
  const nowMs = now.getTime()

  try {
    const detailFirstMetricsBaselineAt = await fetchDetailFirstMetricsBaselineAt(admin)
    const isoFunnelCohort = cohortQueryIsoCutoff({
      maxLookbackHours: FUNNEL_COHORT_HOURS,
      nowMs,
      metricsBaselineAt: detailFirstMetricsBaselineAt,
    })

    const [
      orchestrationRowsResult,
      funnelCohortRows,
      funnelConfigRows,
      geocodeDeadLetterBuckets,
      needsCheckBreakdown,
      needsCheckRootCauseAnalysis,
      listFastFailureDistributionAnalysis,
      publishedNotVisibleDistributionAnalysis,
      addressEnrichmentDrainCohort,
      statusPublishFailedResult,
      statusExpiredResult,
      statusReadyResult,
      statusPublishingResult,
    ] = await Promise.all([
      fromBase(admin, 'ingestion_orchestration_runs')
        .select(
          'created_at, mode, duration_ms, batch_size, concurrency, claimed_count, geocode_succeeded_count, failed_retriable_count, failed_terminal_count, publish_attempted_count, publish_succeeded_count, publish_failed_count, publish_expired_count, publish_skipped_count, rate_429_count, notes'
        )
        .gte('created_at', isoFunnelCohort)
        .order('created_at', { ascending: false })
        .limit(ORCHESTRATION_RUNS_LIMIT),
      fetchAllRows<FunnelCohortRow>(admin, 'ingested_sales', FUNNEL_COHORT_SELECT, (q) =>
        q.gte('created_at', isoFunnelCohort)
      ),
      fetchFunnelLeaderboardConfigRows(admin),
      countGeocodeDeadLetterReplayBuckets({ scanCap: 500 }),
      countNeedsCheckBreakdown(),
      analyzeNeedsCheckRootCause(now),
      analyzeListFastFailureDistribution(now),
      analyzePublishedNotVisibleDistribution(now),
      analyzeAddressEnrichmentDrainCohort(now),
      fromBase(admin, 'ingested_sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'publish_failed'),
      fromBase(admin, 'ingested_sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'expired'),
      fromBase(admin, 'ingested_sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ready'),
      fromBase(admin, 'ingested_sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'publishing'),
    ])

    if (orchestrationRowsResult.error) {
      throw new Error(orchestrationRowsResult.error.message)
    }
    if (statusPublishFailedResult.error) {
      throw new Error(statusPublishFailedResult.error.message)
    }
    if (statusExpiredResult.error) {
      throw new Error(statusExpiredResult.error.message)
    }
    if (statusReadyResult.error) {
      throw new Error(statusReadyResult.error.message)
    }
    if (statusPublishingResult.error) {
      throw new Error(statusPublishingResult.error.message)
    }

    const orchRows = (orchestrationRowsResult.data || []) as OrchestrationRunRow[]
    const funnel = buildIngestionFunnelMetrics({
      orchestrationRows: orchRows,
      cohortRows: funnelCohortRows,
      configRows: funnelConfigRows,
      nowMs,
      metricsBaselineAt: detailFirstMetricsBaselineAt,
    })

    const detailFirstProof = evaluateDetailFirstProofProtocol({
      metricsBaselineAt: detailFirstMetricsBaselineAt,
      detailFirst: funnel['24h'].detailFirst,
    })

    return {
      ok: true,
      generatedAt: now.toISOString(),
      diagnosticsLoaded: true,
      detailFirstProof,
      funnel,
      failureBreakdown: {
        needs_check: needsCheckBreakdown.total,
        publish_failed: statusPublishFailedResult.count ?? 0,
        expired: statusExpiredResult.count ?? 0,
        ready: statusReadyResult.count ?? 0,
        publishing: statusPublishingResult.count ?? 0,
      },
      needsCheckBreakdown,
      needsCheckRootCauseAnalysis,
      listFastFailureDistributionAnalysis,
      publishedNotVisibleDistributionAnalysis,
      addressEnrichmentDrainCohort,
      geocodeDeadLetter: {
        replayableTransientNeedsCheck: geocodeDeadLetterBuckets.replayableTransientNeedsCheck,
        terminalGeocodeNeedsCheck: geocodeDeadLetterBuckets.terminalGeocodeNeedsCheck,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'admin ingestion diagnostics metrics failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/metrics/diagnostics' }
    )
    throw err instanceof Error ? err : new Error(message)
  }
}
