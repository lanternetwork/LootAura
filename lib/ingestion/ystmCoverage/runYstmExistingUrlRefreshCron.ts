import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import {
  attemptYstmDetailFirstReady,
  emptyYstmDetailFirstRunMetrics,
  mergeYstmDetailFirstMetrics,
  type YstmDetailFirstRunMetrics,
} from '@/lib/ingestion/acquisition/ystmDetailFirstReady'
import {
  acquireIngestionOrchestrationLease,
  releaseIngestionOrchestrationLease,
} from '@/lib/ingestion/ingestionOrchestrationLease'
import { buildCoverageMissingIngestionContext } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingListSeed'
import {
  fetchExistingUrlRefreshCandidatePage,
  isEligibleForExistingUrlRefresh,
} from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshCandidates'
import { fetchCoverageBootstrapEnabled } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import {
  parseYstmExistingUrlRefreshBudgets,
  YSTM_COVERAGE_EXISTING_REFRESH_STATE_KEY,
  type YstmExistingUrlRefreshBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshConfig'
import { markCoverageObservationVisibleForSourceUrl } from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshMetrics'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type YstmExistingUrlRefreshCronTelemetry = {
  skipped: boolean
  skipReason: string | null
  queueOffsetBefore: number
  queueOffsetAfter: number
  queueTotal: number
  candidatesScanned: number
  refreshAttempts: number
  refreshed: number
  published: number
  markedExpired: number
  failed: number
  skippedFresh: number
  overlapPrevented: boolean
}

export type YstmExistingUrlRefreshCronResult = {
  ok: boolean
  telemetry: YstmExistingUrlRefreshCronTelemetry
  detailFirstMetrics: YstmDetailFirstRunMetrics
}

export async function runYstmExistingUrlRefreshCron(
  admin: ReturnType<typeof getAdminDb>,
  options?: { budgets?: YstmExistingUrlRefreshBudgets; bootstrapEnabled?: boolean }
): Promise<YstmExistingUrlRefreshCronResult> {
  const bootstrapEnabled =
    options?.bootstrapEnabled ?? (await fetchCoverageBootstrapEnabled(admin))
  const budgets = options?.budgets ?? parseYstmExistingUrlRefreshBudgets(process.env, bootstrapEnabled)
  const logContext = { component: 'ingestion/ystmCoverage/runYstmExistingUrlRefreshCron' }
  const startedMs = Date.now()
  const detailFirstMetrics = emptyYstmDetailFirstRunMetrics()

  const lease = await acquireIngestionOrchestrationLease(
    YSTM_COVERAGE_EXISTING_REFRESH_STATE_KEY,
    logContext
  )
  if (!lease.acquired) {
    return {
      ok: true,
      detailFirstMetrics,
      telemetry: {
        skipped: true,
        skipReason: lease.reason ?? 'active_lease',
        queueOffsetBefore: lease.cursor,
        queueOffsetAfter: lease.cursor,
        queueTotal: 0,
        candidatesScanned: 0,
        refreshAttempts: 0,
        refreshed: 0,
        published: 0,
        markedExpired: 0,
        failed: 0,
        skippedFresh: 0,
        overlapPrevented: true,
      },
    }
  }

  const queueOffsetBefore = lease.cursor
  let queueOffsetAfter = queueOffsetBefore
  let queueTotal = 0
  let candidatesScanned = 0
  let refreshAttempts = 0
  let refreshed = 0
  let published = 0
  let markedExpired = 0
  let failed = 0
  let skippedFresh = 0

  try {
    const page = await fetchExistingUrlRefreshCandidatePage(admin, {
      queueOffset: queueOffsetBefore,
      scanLimit: budgets.maxCandidatesScannedPerRun,
      budgets,
    })
    queueTotal = page.queueTotal
    queueOffsetAfter = page.nextQueueOffset
    candidatesScanned = page.candidates.length

    if (queueTotal === 0) {
      await releaseIngestionOrchestrationLease(YSTM_COVERAGE_EXISTING_REFRESH_STATE_KEY, logContext, {
        owner: lease.owner,
        nextCursor: 0,
        markCompleted: true,
      })
      return {
        ok: true,
        detailFirstMetrics,
        telemetry: {
          skipped: false,
          skipReason: 'empty_refresh_queue',
          queueOffsetBefore,
          queueOffsetAfter: 0,
          queueTotal: 0,
          candidatesScanned: 0,
          refreshAttempts: 0,
          refreshed: 0,
          published: 0,
          markedExpired: 0,
          failed: 0,
          skippedFresh: 0,
          overlapPrevented: false,
        },
      }
    }

    for (const candidate of page.candidates) {
      if (refreshAttempts >= budgets.maxRefreshesPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

      if (!isEligibleForExistingUrlRefresh(candidate, Date.now(), budgets.staleSyncHours)) {
        skippedFresh += 1
        continue
      }

      const { config, listSeed, rowPayload } = buildCoverageMissingIngestionContext({
        canonicalUrl: canonicalSourceUrl(candidate.sourceUrl),
        city: candidate.city,
        state: candidate.state,
      })

      refreshAttempts += 1
      const { result, metrics } = await attemptYstmDetailFirstReady({
        config,
        listSeed: { ...listSeed, sourceUrl: candidate.sourceUrl },
        platform: 'external_page_source',
        rowPayload: { ...rowPayload, coverageExistingRefresh: true },
        pageIndex: 0,
        existingIngestedSaleId: candidate.ingestedSaleId,
        telemetryContext: {
          adapter: 'ystm_coverage_existing_refresh',
          ingestedSaleId: candidate.ingestedSaleId,
        },
      })
      mergeYstmDetailFirstMetrics(detailFirstMetrics, metrics)

      if (result.outcome === 'ready') {
        refreshed += 1
        if (result.markedExpired) {
          markedExpired += 1
        } else if (result.published) {
          published += 1
          try {
            await markCoverageObservationVisibleForSourceUrl(admin, candidate.sourceUrl)
          } catch {
            // Observation row may not exist for out-of-footprint ingested URLs.
          }
        }
        continue
      }

      failed += 1
    }

    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_EXISTING_REFRESH_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: queueOffsetAfter,
      markCompleted: true,
    })

    logger.info('YSTM existing URL refresh cron completed', {
      ...logContext,
      queueOffsetBefore,
      queueOffsetAfter,
      queueTotal,
      refreshAttempts,
      refreshed,
      published,
      markedExpired,
      failed,
    })

    return {
      ok: true,
      detailFirstMetrics,
      telemetry: {
        skipped: false,
        skipReason: null,
        queueOffsetBefore,
        queueOffsetAfter,
        queueTotal,
        candidatesScanned,
        refreshAttempts,
        refreshed,
        published,
        markedExpired,
        failed,
        skippedFresh,
        overlapPrevented: false,
      },
    }
  } catch (err) {
    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_EXISTING_REFRESH_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: queueOffsetAfter,
      markCompleted: false,
    })
    throw err
  }
}
