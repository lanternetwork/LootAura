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
  fetchCatalogRepairCandidatePage,
  isEligibleForCatalogRepairRetry,
} from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairCandidates'
import { fetchCoverageBootstrapEnabled } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import {
  parseYstmCatalogRepairBudgets,
  YSTM_COVERAGE_CATALOG_REPAIR_STATE_KEY,
  type YstmCatalogRepairBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairConfig'
import { followUpCatalogRepairPublishOrGeocode } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairFollowUp'
import {
  recordYstmCatalogRepairOutcome,
  type YstmCatalogRepairOutcome,
} from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairStore'
import { markCoverageObservationVisibleForSourceUrl } from '@/lib/ingestion/ystmCoverage/ystmExistingUrlRefreshMetrics'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type YstmCatalogRepairCronTelemetry = {
  skipped: boolean
  skipReason: string | null
  queueOffsetBefore: number
  queueOffsetAfter: number
  queueTotal: number
  candidatesScanned: number
  repairAttempts: number
  published: number
  geocoded: number
  refreshedReady: number
  markedExpired: number
  skippedNotEligible: number
  failed: number
  overlapPrevented: boolean
}

export type YstmCatalogRepairCronResult = {
  ok: boolean
  telemetry: YstmCatalogRepairCronTelemetry
  detailFirstMetrics: YstmDetailFirstRunMetrics
}

function mapFollowUpToOutcome(
  followUp: Awaited<ReturnType<typeof followUpCatalogRepairPublishOrGeocode>>,
  detailMarkedExpired: boolean
): YstmCatalogRepairOutcome {
  if (detailMarkedExpired) return 'marked_expired'
  switch (followUp.kind) {
    case 'published':
      return 'published'
    case 'geocoded':
      return followUp.published ? 'published' : 'geocoded'
    case 'refreshed_ready':
      return followUp.published ? 'published' : 'refreshed_ready'
    case 'skipped_not_eligible':
      return 'skipped_not_eligible'
    case 'failed':
      return 'failed'
    default:
      return 'failed'
  }
}

export async function runYstmCatalogRepairCron(
  admin: ReturnType<typeof getAdminDb>,
  options?: { budgets?: YstmCatalogRepairBudgets; bootstrapEnabled?: boolean }
): Promise<YstmCatalogRepairCronResult> {
  const bootstrapEnabled =
    options?.bootstrapEnabled ?? (await fetchCoverageBootstrapEnabled(admin))
  const budgets = options?.budgets ?? parseYstmCatalogRepairBudgets(process.env, bootstrapEnabled)
  const logContext = { component: 'ingestion/ystmCoverage/runYstmCatalogRepairCron' }
  const startedMs = Date.now()
  const detailFirstMetrics = emptyYstmDetailFirstRunMetrics()

  const lease = await acquireIngestionOrchestrationLease(
    YSTM_COVERAGE_CATALOG_REPAIR_STATE_KEY,
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
        repairAttempts: 0,
        published: 0,
        geocoded: 0,
        refreshedReady: 0,
        markedExpired: 0,
        skippedNotEligible: 0,
        failed: 0,
        overlapPrevented: true,
      },
    }
  }

  const queueOffsetBefore = lease.cursor
  let queueOffsetAfter = queueOffsetBefore
  let queueTotal = 0
  let candidatesScanned = 0
  let repairAttempts = 0
  let published = 0
  let geocoded = 0
  let refreshedReady = 0
  let markedExpired = 0
  let skippedNotEligible = 0
  let failed = 0

  try {
    const page = await fetchCatalogRepairCandidatePage(admin, {
      queueOffset: queueOffsetBefore,
      scanLimit: budgets.maxCandidatesScannedPerRun,
      budgets,
    })
    queueTotal = page.queueTotal
    queueOffsetAfter = page.nextQueueOffset
    candidatesScanned = page.candidates.length

    if (queueTotal === 0) {
      await releaseIngestionOrchestrationLease(YSTM_COVERAGE_CATALOG_REPAIR_STATE_KEY, logContext, {
        owner: lease.owner,
        nextCursor: 0,
        markCompleted: true,
      })
      return {
        ok: true,
        detailFirstMetrics,
        telemetry: {
          skipped: false,
          skipReason: 'empty_repair_queue',
          queueOffsetBefore,
          queueOffsetAfter: 0,
          queueTotal: 0,
          candidatesScanned: 0,
          repairAttempts: 0,
          published: 0,
          geocoded: 0,
          refreshedReady: 0,
          markedExpired: 0,
          skippedNotEligible: 0,
          failed: 0,
          overlapPrevented: false,
        },
      }
    }

    for (const candidate of page.candidates) {
      if (repairAttempts >= budgets.maxRepairsPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

      if (!isEligibleForCatalogRepairRetry(candidate, Date.now(), budgets.failedRetryHours)) {
        continue
      }

      const { config, listSeed, rowPayload } = buildCoverageMissingIngestionContext({
        canonicalUrl: canonicalSourceUrl(candidate.sourceUrl),
        city: candidate.city,
        state: candidate.state,
      })

      repairAttempts += 1
      const { result, metrics } = await attemptYstmDetailFirstReady({
        config,
        listSeed: { ...listSeed, sourceUrl: candidate.sourceUrl },
        platform: 'external_page_source',
        rowPayload: { ...rowPayload, coverageCatalogRepair: true },
        pageIndex: 0,
        existingIngestedSaleId: candidate.ingestedSaleId,
        telemetryContext: {
          adapter: 'ystm_coverage_catalog_repair',
          ingestedSaleId: candidate.ingestedSaleId,
          priorStatus: candidate.status,
        },
      })
      mergeYstmDetailFirstMetrics(detailFirstMetrics, metrics)

      const detailMarkedExpired =
        result.outcome === 'ready' && result.markedExpired === true

      if (result.outcome === 'fallback') {
        failed += 1
        await recordYstmCatalogRepairOutcome(admin, candidate.ingestedSaleId, {
          outcome: 'failed',
          failureReason: result.reason,
        })
        continue
      }

      const followUp = await followUpCatalogRepairPublishOrGeocode(admin, candidate.ingestedSaleId)
      const outcome = mapFollowUpToOutcome(followUp, detailMarkedExpired)
      const failureReason =
        outcome === 'failed' && followUp.kind === 'failed'
          ? followUp.reason
          : outcome === 'skipped_not_eligible' && followUp.kind === 'skipped_not_eligible'
            ? followUp.reason
            : null
      await recordYstmCatalogRepairOutcome(admin, candidate.ingestedSaleId, {
        outcome,
        failureReason,
      })

      if (outcome === 'published') {
        published += 1
        try {
          await markCoverageObservationVisibleForSourceUrl(admin, candidate.sourceUrl)
        } catch {
          // Observation may not exist for out-of-footprint rows.
        }
      } else if (outcome === 'geocoded') {
        geocoded += 1
      } else if (outcome === 'refreshed_ready') {
        refreshedReady += 1
      } else if (outcome === 'marked_expired') {
        markedExpired += 1
      } else if (outcome === 'skipped_not_eligible') {
        skippedNotEligible += 1
      } else {
        failed += 1
      }
    }

    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_CATALOG_REPAIR_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: queueOffsetAfter,
      markCompleted: true,
    })

    logger.info('YSTM catalog repair cron completed', {
      ...logContext,
      queueOffsetBefore,
      queueOffsetAfter,
      queueTotal,
      repairAttempts,
      published,
      geocoded,
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
        repairAttempts,
        published,
        geocoded,
        refreshedReady,
        markedExpired,
        skippedNotEligible,
        failed,
        overlapPrevented: false,
      },
    }
  } catch (err) {
    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_CATALOG_REPAIR_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: queueOffsetAfter,
      markCompleted: false,
    })
    throw err
  }
}
