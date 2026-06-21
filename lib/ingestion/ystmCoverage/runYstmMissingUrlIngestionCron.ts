import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import {
  attemptYstmDetailFirstReady,
  emptyYstmDetailFirstRunMetrics,
  mergeYstmDetailFirstMetrics,
  type YstmDetailFirstRunMetrics,
} from '@/lib/ingestion/acquisition/ystmDetailFirstReady'
import { attemptYstmListFastPublish } from '@/lib/ingestion/acquisition/ystmListFastPublish'
import {
  findPublishedIngestedSaleIdForDetailFirst,
} from '@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst'
import {
  acquireIngestionOrchestrationLease,
  releaseIngestionOrchestrationLease,
} from '@/lib/ingestion/ingestionOrchestrationLease'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import { buildCoverageMissingIngestionContext, buildListMetadataIngestionContext } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingListSeed'
import {
  countColdMissingQueueTotal,
  countHotMissingQueueTotal,
  fetchColdMissingIngestionCandidatePage,
  fetchHotMissingIngestionCandidates,
  isEligibleForMissingIngestionRetry,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingCandidates'
import { HOT_MISSING_INGEST_BUDGET_RATIO } from '@/lib/ingestion/ystmCoverage/ystmFreshDiscoveryConfig'
import { fetchCoverageBootstrapEnabled } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import {
  parseYstmCoverageMissingIngestionBudgets,
  YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY,
  type YstmCoverageMissingIngestionBudgets,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingIngestionConfig'
import {
  fetchMissingIngestFetchFailedCandidates,
  loadWouldPublishShadowCanonicalUrls,
} from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedCandidates'
import { MISSING_INGEST_FETCH_FAILED_MAX_CLAIM_PER_RUN } from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedRecoveryConfig'
import {
  buildFetchFailedReplayFailurePatch,
  recordYstmCoverageMissingIngestionOutcome,
  type YstmCoverageMissingIngestionOutcome,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import type { MissingIngestionFailureDetails } from '@/lib/ingestion/ystmCoverage/listFastInsertFailureDiagnosticTypes'
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
  fetchFailedPriorityClaimed: number
  fetchFailedPriorityAttempts: number
  fetchFailedPriorityPublished: number
  fetchFailedPriorityIngested: number
  fetchFailedPriorityFailed: number
  fetchFailedPriorityTerminalized: number
  fetchFailedPrioritySkippedCooldown: number
  hotQueueTotal: number
  coldQueueTotal: number
  reservedHotBudget: number
  hotFetchLimit: number
  hotCandidatesScanned: number
  hotCandidatesAttempted: number
  coldCandidatesScanned: number
  listFastAttempts: number
  listFastPublished: number
  listFastFailed: number
}

export function computeReservedHotBudget(
  hotQueueTotal: number,
  maxAttemptsPerRun: number,
  hotRatio: number = HOT_MISSING_INGEST_BUDGET_RATIO
): number {
  if (hotQueueTotal <= 0) return 0
  return Math.min(maxAttemptsPerRun, Math.max(Math.floor(maxAttemptsPerRun * hotRatio), 1))
}

export function computeHotFetchLimit(
  hotQueueTotal: number,
  reservedHotBudget: number,
  maxCandidatesScannedPerRun: number
): number {
  if (hotQueueTotal <= 0) return 0
  return Math.min(maxCandidatesScannedPerRun, Math.max(reservedHotBudget * 2, 1))
}

function emptyMissingIngestTelemetry(
  partial: Partial<YstmMissingUrlIngestionCronTelemetry> &
    Pick<YstmMissingUrlIngestionCronTelemetry, 'skipped' | 'skipReason' | 'queueOffsetBefore' | 'queueOffsetAfter'>
): YstmMissingUrlIngestionCronTelemetry {
  return {
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
    fetchFailedPriorityClaimed: 0,
    fetchFailedPriorityAttempts: 0,
    fetchFailedPriorityPublished: 0,
    fetchFailedPriorityIngested: 0,
    fetchFailedPriorityFailed: 0,
    fetchFailedPriorityTerminalized: 0,
    fetchFailedPrioritySkippedCooldown: 0,
    hotQueueTotal: 0,
    coldQueueTotal: 0,
    reservedHotBudget: 0,
    hotFetchLimit: 0,
    hotCandidatesScanned: 0,
    hotCandidatesAttempted: 0,
    coldCandidatesScanned: 0,
    listFastAttempts: 0,
    listFastPublished: 0,
    listFastFailed: 0,
    ...partial,
  }
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
  options?: { budgets?: YstmCoverageMissingIngestionBudgets; bootstrapEnabled?: boolean }
): Promise<YstmMissingUrlIngestionCronResult> {
  const bootstrapEnabled =
    options?.bootstrapEnabled ?? (await fetchCoverageBootstrapEnabled(admin))
  const budgets = options?.budgets ?? parseYstmCoverageMissingIngestionBudgets(process.env, bootstrapEnabled)
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
      telemetry: emptyMissingIngestTelemetry({
        skipped: true,
        skipReason: lease.reason ?? 'active_lease',
        queueOffsetBefore: lease.cursor,
        queueOffsetAfter: lease.cursor,
        overlapPrevented: true,
      }),
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
  let fetchFailedPriorityClaimed = 0
  let fetchFailedPriorityAttempts = 0
  let fetchFailedPriorityPublished = 0
  let fetchFailedPriorityIngested = 0
  let fetchFailedPriorityFailed = 0
  let fetchFailedPriorityTerminalized = 0
  let fetchFailedPrioritySkippedCooldown = 0
  let hotQueueTotal = 0
  let coldQueueTotal = 0
  let reservedHotBudget = 0
  let hotFetchLimit = 0
  let hotCandidatesScanned = 0
  let hotCandidatesAttempted = 0
  let coldCandidatesScanned = 0
  let listFastAttempts = 0
  let listFastPublished = 0
  let listFastFailed = 0
  const detailFirstMetrics = emptyYstmDetailFirstRunMetrics()
  const processedCanonicalUrls = new Set<string>()

  try {
    const publishedIndex = await loadLootAuraPublishedYstmIndex(admin)
    hotQueueTotal = await countHotMissingQueueTotal(admin)
    coldQueueTotal = await countColdMissingQueueTotal(admin)
    queueTotal = hotQueueTotal + coldQueueTotal
    reservedHotBudget = computeReservedHotBudget(hotQueueTotal, budgets.maxAttemptsPerRun)
    hotFetchLimit = computeHotFetchLimit(
      hotQueueTotal,
      reservedHotBudget,
      budgets.maxCandidatesScannedPerRun
    )

    if (queueTotal === 0) {
      await releaseIngestionOrchestrationLease(YSTM_COVERAGE_MISSING_INGESTION_STATE_KEY, logContext, {
        owner: lease.owner,
        nextCursor: 0,
        markCompleted: true,
      })
      return {
        ok: true,
        detailFirstMetrics,
        telemetry: emptyMissingIngestTelemetry({
          skipped: false,
          skipReason: 'empty_missing_queue',
          queueOffsetBefore,
          queueOffsetAfter: 0,
        }),
      }
    }

    const wouldPublishUrls = await loadWouldPublishShadowCanonicalUrls(admin)
    const fetchFailedCandidates = await fetchMissingIngestFetchFailedCandidates(admin, {
      limit: MISSING_INGEST_FETCH_FAILED_MAX_CLAIM_PER_RUN,
      nowMs: Date.now(),
      wouldPublishUrls,
    })
    fetchFailedPriorityClaimed = fetchFailedCandidates.length

    const processCandidateLoop = async (
      candidates: Array<Parameters<typeof processMissingIngestCandidate>[0]['candidate']>,
      opts: { isFetchFailedReplay: boolean; isHotPass?: boolean; onHotAttempt?: () => void }
    ) => {
      for (const candidate of candidates) {
        if (detailFirstAttempts >= budgets.maxAttemptsPerRun) break
        if (Date.now() - startedMs >= budgets.maxRuntimeMs) break
        if (processedCanonicalUrls.has(candidate.canonicalUrl)) continue

        if (
          !opts.isFetchFailedReplay &&
          !isEligibleForMissingIngestionRetry(
            {
              missingIngestionOutcome: candidate.missingIngestionOutcome ?? null,
              missingIngestionAttemptedAt: candidate.missingIngestionAttemptedAt ?? null,
            },
            Date.now(),
            budgets.failedRetryHours
          )
        ) {
          skippedCooldown += 1
          continue
        }

        const outcome = await processMissingIngestCandidate({
          admin,
          candidate,
          publishedIndex,
          budgets,
          startedMs,
          detailFirstMetrics,
          onAttempt: () => {
            detailFirstAttempts += 1
            opts.onHotAttempt?.()
            if (opts.isHotPass) hotCandidatesAttempted += 1
          },
          isFetchFailedReplay: opts.isFetchFailedReplay,
          onListFastAttempt: () => {
            listFastAttempts += 1
          },
          onListFastPublished: () => {
            listFastPublished += 1
          },
          onListFastFailed: () => {
            listFastFailed += 1
          },
        })

        processedCanonicalUrls.add(candidate.canonicalUrl)

        if (outcome.kind === 'skipped_cooldown') {
          if (opts.isFetchFailedReplay) fetchFailedPrioritySkippedCooldown += 1
          else skippedCooldown += 1
          continue
        }
        if (outcome.kind === 'skipped_visible') {
          skippedVisible += 1
          continue
        }
        if (outcome.kind === 'skipped_existing') {
          skippedExisting += 1
          continue
        }
        if (outcome.kind === 'published') {
          published += 1
          if (opts.isFetchFailedReplay) fetchFailedPriorityPublished += 1
          continue
        }
        if (outcome.kind === 'ingested') {
          ingested += 1
          if (opts.isFetchFailedReplay) fetchFailedPriorityIngested += 1
          continue
        }
        if (outcome.kind === 'failed') {
          failed += 1
          if (opts.isFetchFailedReplay) fetchFailedPriorityFailed += 1
          continue
        }
        if (outcome.kind === 'terminalized') {
          failed += 1
          if (opts.isFetchFailedReplay) fetchFailedPriorityTerminalized += 1
        }
      }
    }

    await processCandidateLoop(fetchFailedCandidates, {
      isFetchFailedReplay: true,
      onHotAttempt: () => {
        fetchFailedPriorityAttempts += 1
      },
    })

    if (hotQueueTotal > 0) {
      if (hotFetchLimit <= 0) {
        logger.error(
          'YSTM missing URL ingestion hot phase blocked: invalid hot fetch limit',
          undefined,
          {
            ...logContext,
            hotQueueTotal,
            reservedHotBudget,
            hotFetchLimit,
          }
        )
      } else {
        const hotCandidates = await fetchHotMissingIngestionCandidates(admin, {
          limit: hotFetchLimit,
          budgets,
        })
        hotCandidatesScanned = hotCandidates.length
        candidatesScanned += hotCandidates.length
        await processCandidateLoop(hotCandidates, {
          isFetchFailedReplay: false,
          isHotPass: true,
        })
      }
    }

    if (hotQueueTotal === 0 && detailFirstAttempts < budgets.maxAttemptsPerRun) {
      const coldPage = await fetchColdMissingIngestionCandidatePage(admin, {
        queueOffset: queueOffsetBefore,
        scanLimit: budgets.maxCandidatesScannedPerRun,
        budgets,
      })
      queueOffsetAfter = coldPage.nextQueueOffset
      coldCandidatesScanned = coldPage.candidates.length
      candidatesScanned += coldPage.candidates.length
      await processCandidateLoop(coldPage.candidates, { isFetchFailedReplay: false })
    } else if (hotQueueTotal === 0) {
      queueOffsetAfter = queueOffsetBefore
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
      fetchFailedPriorityClaimed,
      fetchFailedPriorityAttempts,
      fetchFailedPriorityPublished,
      fetchFailedPriorityIngested,
      fetchFailedPriorityFailed,
      fetchFailedPriorityTerminalized,
      hotQueueTotal,
      coldQueueTotal,
      reservedHotBudget,
      hotFetchLimit,
      hotCandidatesScanned,
      hotCandidatesAttempted,
      coldCandidatesScanned,
      listFastAttempts,
      listFastPublished,
      listFastFailed,
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
        fetchFailedPriorityClaimed,
        fetchFailedPriorityAttempts,
        fetchFailedPriorityPublished,
        fetchFailedPriorityIngested,
        fetchFailedPriorityFailed,
        fetchFailedPriorityTerminalized,
        fetchFailedPrioritySkippedCooldown,
        hotQueueTotal,
        coldQueueTotal,
        reservedHotBudget,
        hotFetchLimit,
        hotCandidatesScanned,
        hotCandidatesAttempted,
        coldCandidatesScanned,
        listFastAttempts,
        listFastPublished,
        listFastFailed,
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

type MissingIngestCandidateLike = {
  canonicalUrl: string
  city: string | null
  state: string | null
  configKey: string | null
  missingIngestionOutcome?: string | null
  missingIngestionAttemptedAt?: string | null
  missingIngestionReplayCount?: number
  discoveryPriority?: string | null
  listMetadataSnapshot?: import('@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales').YstmListMetadataSale | null
}

type ProcessMissingIngestOutcome =
  | { kind: 'skipped_cooldown' }
  | { kind: 'skipped_visible' }
  | { kind: 'skipped_existing' }
  | { kind: 'published' }
  | { kind: 'ingested' }
  | { kind: 'failed' }
  | { kind: 'terminalized' }

function shouldUseListFastPath(candidate: MissingIngestCandidateLike): boolean {
  if (!candidate.listMetadataSnapshot) return false
  const priority = candidate.discoveryPriority
  return priority === 'hot' || priority === 'warm'
}

async function processMissingIngestCandidate(params: {
  admin: ReturnType<typeof getAdminDb>
  candidate: MissingIngestCandidateLike
  publishedIndex: Awaited<ReturnType<typeof loadLootAuraPublishedYstmIndex>>
  budgets: YstmCoverageMissingIngestionBudgets
  startedMs: number
  detailFirstMetrics: YstmDetailFirstRunMetrics
  onAttempt: () => void
  isFetchFailedReplay: boolean
  onListFastAttempt?: () => void
  onListFastPublished?: () => void
  onListFastFailed?: () => void
}): Promise<ProcessMissingIngestOutcome> {
  const {
    admin,
    candidate,
    publishedIndex,
    detailFirstMetrics,
    onAttempt,
    isFetchFailedReplay,
    onListFastAttempt,
    onListFastPublished,
    onListFastFailed,
  } = params
  const canonical = candidate.canonicalUrl

  if (publishedIndex.visibleCanonicalUrls.has(canonical)) {
    await recordOutcome(admin, canonical, 'skipped_visible', { lootauraVisible: true })
    return { kind: 'skipped_visible' }
  }

  const existingPublishedId = await findPublishedIngestedSaleIdForDetailFirst(admin, canonical)
  if (existingPublishedId) {
    await recordOutcome(admin, canonical, 'skipped_visible', { lootauraVisible: true })
    return { kind: 'skipped_visible' }
  }

  if (await hasNonDuplicateIngestedSale(admin, canonical)) {
    await recordOutcome(admin, canonical, 'skipped_existing')
    return { kind: 'skipped_existing' }
  }

  if (shouldUseListFastPath(candidate) && candidate.listMetadataSnapshot) {
    onAttempt()
    onListFastAttempt?.()
    const listFast = await attemptYstmListFastPublish({
      sale: candidate.listMetadataSnapshot,
      city: (candidate.city?.trim() || 'Unknown'),
      state: (candidate.state?.trim() || 'XX'),
      configKey: candidate.configKey,
      telemetryContext: {
        adapter: isFetchFailedReplay
          ? 'ystm_coverage_missing_ingest_fetch_failed_replay'
          : 'ystm_coverage_missing_ingest_list_fast',
        configKey: candidate.configKey,
      },
    })
    if (listFast.outcome === 'published') {
      onListFastPublished?.()
      await recordOutcome(admin, canonical, 'published', {
        lootauraVisible: true,
        resetFetchFailedReplay: isFetchFailedReplay,
      })
      return { kind: 'published' }
    }
    if (listFast.outcome === 'ingested') {
      await recordOutcome(admin, canonical, 'ingested', {
        resetFetchFailedReplay: isFetchFailedReplay,
      })
      return { kind: 'ingested' }
    }
    if (listFast.outcome === 'skipped_duplicate') {
      await recordOutcome(admin, canonical, 'skipped_visible', { lootauraVisible: true })
      return { kind: 'skipped_visible' }
    }
    if (listFast.outcome === 'skipped_invalid') {
      onListFastFailed?.()
      await recordOutcome(admin, canonical, 'failed', {
        failureReason: listFast.reason,
        missingIngestionFailureDetails: null,
      })
      return { kind: 'failed' }
    }
    onListFastFailed?.()
    await recordOutcome(admin, canonical, 'failed', {
      failureReason: listFast.reason,
      missingIngestionFailureDetails:
        listFast.outcome === 'failed' ? (listFast.missingIngestionFailureDetails ?? null) : null,
    })
    return { kind: 'failed' }
  }

  const context =
    candidate.listMetadataSnapshot != null
      ? buildListMetadataIngestionContext({
          canonicalUrl: canonical,
          city: candidate.city,
          state: candidate.state,
          metadata: candidate.listMetadataSnapshot,
        })
      : buildCoverageMissingIngestionContext({
          canonicalUrl: canonical,
          city: candidate.city,
          state: candidate.state,
        })
  const { config, listSeed, rowPayload } = context

  onAttempt()
  const { result, metrics } = await attemptYstmDetailFirstReady({
    config,
    listSeed,
    platform: 'external_page_source',
    rowPayload,
    pageIndex: 0,
    telemetryContext: {
      adapter: isFetchFailedReplay
        ? 'ystm_coverage_missing_ingest_fetch_failed_replay'
        : 'ystm_coverage_missing_ingest',
      configKey: candidate.configKey,
    },
  })
  mergeYstmDetailFirstMetrics(detailFirstMetrics, metrics)

  if (result.outcome === 'ready') {
    if (result.published) {
      await recordOutcome(admin, canonical, 'published', {
        lootauraVisible: true,
        resetFetchFailedReplay: isFetchFailedReplay,
      })
      return { kind: 'published' }
    }
    await recordOutcome(admin, canonical, 'ingested', {
      resetFetchFailedReplay: isFetchFailedReplay,
    })
    return { kind: 'ingested' }
  }

  if (isFetchFailedReplay && result.reason === 'fetch_failed') {
    const replayPatch = buildFetchFailedReplayFailurePatch(
      candidate.missingIngestionReplayCount ?? 0
    )
    await recordOutcome(admin, canonical, replayPatch.outcome, {
      failureReason: replayPatch.failureReason,
      missingIngestionReplayCount: replayPatch.missingIngestionReplayCount,
      missingIngestionLastRetryAt: replayPatch.missingIngestionLastRetryAt,
    })
    return replayPatch.outcome === 'terminal' ? { kind: 'terminalized' } : { kind: 'failed' }
  }

  await recordOutcome(admin, canonical, 'failed', {
    failureReason: result.reason,
  })
  return { kind: 'failed' }
}

async function recordOutcome(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  outcome: YstmCoverageMissingIngestionOutcome,
  extra?: {
    failureReason?: string
    missingIngestionFailureDetails?: MissingIngestionFailureDetails | null
    lootauraVisible?: boolean
    missingIngestionReplayCount?: number
    missingIngestionLastRetryAt?: string | null
    resetFetchFailedReplay?: boolean
  }
): Promise<void> {
  await recordYstmCoverageMissingIngestionOutcome(admin, canonicalUrl, {
    outcome,
    failureReason: extra?.failureReason ?? null,
    missingIngestionFailureDetails: extra?.missingIngestionFailureDetails,
    lootauraVisible: extra?.lootauraVisible,
    missingIngestionReplayCount: extra?.missingIngestionReplayCount,
    missingIngestionLastRetryAt: extra?.missingIngestionLastRetryAt,
    resetFetchFailedReplay: extra?.resetFetchFailedReplay,
  })
}
