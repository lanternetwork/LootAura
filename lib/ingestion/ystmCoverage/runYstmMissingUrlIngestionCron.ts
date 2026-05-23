import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import {
  attemptYstmDetailFirstReady,
  emptyYstmDetailFirstRunMetrics,
  mergeYstmDetailFirstMetrics,
  type YstmDetailFirstRunMetrics,
} from '@/lib/ingestion/acquisition/ystmDetailFirstReady'
import {
  findPublishedIngestedSaleIdForDetailFirst,
} from '@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst'
import {
  acquireIngestionOrchestrationLease,
  releaseIngestionOrchestrationLease,
} from '@/lib/ingestion/ingestionOrchestrationLease'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import { buildCoverageMissingIngestionContext } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingListSeed'
import {
  fetchMissingIngestionCandidatePage,
  isEligibleForMissingIngestionRetry,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingCandidates'
import {
  parseYstmCoverageMissingIngestionBudgets,
  YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY,
  type YstmCoverageMissingIngestionBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingIngestionConfig'
import {
  recordYstmCoverageMissingIngestionOutcome,
  type YstmCoverageMissingIngestionOutcome,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { findPrimaryIngestedSaleBySourceUrl, pickPrimaryIngestedSaleBySourceUrl } from '@/lib/ingestion/identity/ingestedSaleSourceUrlLookup'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type YstmMissingUrlIngestionCronTelemetry = {
  skipped: boolean
  skipReason: string | null
  queueOffsetBefore: number
  queueOffsetAfter: number
  queueTotal: number
  candidatesScanned: number
  detailFirstAttempts: number
  published: number
  ingested: number
  failed: number
  skippedVisible: number
  skippedExisting: number
  skippedCooldown: number
  overlapPrevented: boolean
}

export type YstmMissingUrlIngestionCronResult = {
  ok: boolean
  telemetry: YstmMissingUrlIngestionCronTelemetry
  detailFirstMetrics: YstmDetailFirstRunMetrics
}

async function hasNonDuplicateIngestedSale(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string
): Promise<boolean> {
  const primary = await findPrimaryIngestedSaleBySourceUrl(admin, canonicalUrl, 'id, is_duplicate')
  if (primary?.id && !primary.is_duplicate) return true

  const canon = canonicalSourceUrl(canonicalUrl)
  const { data: byCanon, error: canonErr } = await fromBase(admin, 'ingested_sales')
    .select('id, superseded_by_ingested_sale_id, is_duplicate')
    .eq('canonical_source_url', canon)
    .order('id', { ascending: true })
    .limit(50)
  if (canonErr) {
    throw new Error(canonErr.message)
  }
  const canonPrimary = pickPrimaryIngestedSaleBySourceUrl(
    (byCanon ?? []) as Array<{ id: string; superseded_by_ingested_sale_id?: string | null; is_duplicate?: boolean }>
  )
  return Boolean(canonPrimary?.id && !canonPrimary.is_duplicate)
}

export async function runYstmMissingUrlIngestionCron(
  admin: ReturnType<typeof getAdminDb>,
  options?: { budgets?: YstmCoverageMissingIngestionBudgets }
): Promise<YstmMissingUrlIngestionCronResult> {
  const budgets = options?.budgets ?? parseYstmCoverageMissingIngestionBudgets()
  const logContext = { component: 'ingestion/ystmCoverage/runYstmMissingUrlIngestionCron' }
  const startedMs = Date.now()
  const emptyMetrics = emptyYstmDetailFirstRunMetrics()

  const lease = await acquireIngestionOrchestrationLease(
    YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY,
    logContext
  )
  if (!lease.acquired) {
    return {
      ok: true,
      detailFirstMetrics: emptyMetrics,
      telemetry: {
        skipped: true,
        skipReason: lease.reason ?? 'active_lease',
        queueOffsetBefore: lease.cursor,
        queueOffsetAfter: lease.cursor,
        queueTotal: 0,
        candidatesScanned: 0,
        detailFirstAttempts: 0,
        published: 0,
        ingested: 0,
        failed: 0,
        skippedVisible: 0,
        skippedExisting: 0,
        skippedCooldown: 0,
        overlapPrevented: true,
      },
    }
  }

  const queueOffsetBefore = lease.cursor
  let queueOffsetAfter = queueOffsetBefore
  let queueTotal = 0
  let candidatesScanned = 0
  let detailFirstAttempts = 0
  let published = 0
  let ingested = 0
  let failed = 0
  let skippedVisible = 0
  let skippedExisting = 0
  let skippedCooldown = 0
  const detailFirstMetrics = emptyYstmDetailFirstRunMetrics()

  try {
    const publishedIndex = await loadLootAuraPublishedYstmIndex(admin)
    const page = await fetchMissingIngestionCandidatePage(admin, {
      queueOffset: queueOffsetBefore,
      scanLimit: budgets.maxCandidatesScannedPerRun,
      budgets,
    })
    queueTotal = page.queueTotal
    queueOffsetAfter = page.nextQueueOffset
    candidatesScanned = page.candidates.length

    if (queueTotal === 0) {
      await releaseIngestionOrchestrationLease(YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY, logContext, {
        owner: lease.owner,
        nextCursor: 0,
        markCompleted: true,
      })
      return {
        ok: true,
        detailFirstMetrics,
        telemetry: {
          skipped: false,
          skipReason: 'empty_missing_queue',
          queueOffsetBefore,
          queueOffsetAfter: 0,
          queueTotal: 0,
          candidatesScanned: 0,
          detailFirstAttempts: 0,
          published: 0,
          ingested: 0,
          failed: 0,
          skippedVisible: 0,
          skippedExisting: 0,
          skippedCooldown: 0,
          overlapPrevented: false,
        },
      }
    }

    for (const candidate of page.candidates) {
      if (detailFirstAttempts >= budgets.maxAttemptsPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

      if (
        !isEligibleForMissingIngestionRetry(candidate, Date.now(), budgets.failedRetryHours)
      ) {
        skippedCooldown += 1
        continue
      }

      const canonical = candidate.canonicalUrl
      if (publishedIndex.visibleCanonicalUrls.has(canonical)) {
        skippedVisible += 1
        await recordOutcome(admin, canonical, 'skipped_visible', { lootauraVisible: true })
        continue
      }

      const existingPublishedId = await findPublishedIngestedSaleIdForDetailFirst(admin, canonical)
      if (existingPublishedId) {
        skippedVisible += 1
        await recordOutcome(admin, canonical, 'skipped_visible', { lootauraVisible: true })
        continue
      }

      if (await hasNonDuplicateIngestedSale(admin, canonical)) {
        skippedExisting += 1
        await recordOutcome(admin, canonical, 'skipped_existing')
        continue
      }

      const { config, listSeed, rowPayload } = buildCoverageMissingIngestionContext({
        canonicalUrl: canonical,
        city: candidate.city,
        state: candidate.state,
      })

      detailFirstAttempts += 1
      const { result, metrics } = await attemptYstmDetailFirstReady({
        config,
        listSeed,
        platform: 'external_page_source',
        rowPayload,
        pageIndex: 0,
        telemetryContext: {
          adapter: 'ystm_coverage_missing_ingest',
          configKey: candidate.configKey,
        },
      })
      mergeYstmDetailFirstMetrics(detailFirstMetrics, metrics)

      if (result.outcome === 'ready') {
        if (result.published) {
          published += 1
          await recordOutcome(admin, canonical, 'published', { lootauraVisible: true })
        } else {
          ingested += 1
          await recordOutcome(admin, canonical, 'ingested')
        }
        continue
      }

      failed += 1
      await recordOutcome(admin, canonical, 'failed', {
        failureReason: result.reason,
      })
    }

    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: queueOffsetAfter,
      markCompleted: true,
    })

    logger.info('YSTM missing URL ingestion cron completed', {
      ...logContext,
      queueOffsetBefore,
      queueOffsetAfter,
      queueTotal,
      detailFirstAttempts,
      published,
      ingested,
      failed,
      skippedVisible,
      skippedExisting,
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
        detailFirstAttempts,
        published,
        ingested,
        failed,
        skippedVisible,
        skippedExisting,
        skippedCooldown,
        overlapPrevented: false,
      },
    }
  } catch (err) {
    await releaseIngestionOrchestrationLease(YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY, logContext, {
      owner: lease.owner,
      nextCursor: queueOffsetAfter,
      markCompleted: false,
    })
    throw err
  }
}

async function recordOutcome(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  outcome: YstmCoverageMissingIngestionOutcome,
  extra?: { failureReason?: string; lootauraVisible?: boolean }
): Promise<void> {
  await recordYstmCoverageMissingIngestionOutcome(admin, canonicalUrl, {
    outcome,
    failureReason: extra?.failureReason ?? null,
    lootauraVisible: extra?.lootauraVisible,
  })
}
