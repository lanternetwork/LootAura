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
        fetchFailedPriorityClaimed: 0,
        fetchFailedPriorityAttempts: 0,
        fetchFailedPriorityPublished: 0,
        fetchFailedPriorityIngested: 0,
        fetchFailedPriorityFailed: 0,
        fetchFailedPriorityTerminalized: 0,
        fetchFailedPrioritySkippedCooldown: 0,
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
  let fetchFailedPriorityClaimed = 0
  let fetchFailedPriorityAttempts = 0
  let fetchFailedPriorityPublished = 0
  let fetchFailedPriorityIngested = 0
  let fetchFailedPriorityFailed = 0
  let fetchFailedPriorityTerminalized = 0
  let fetchFailedPrioritySkippedCooldown = 0
  const detailFirstMetrics = emptyYstmDetailFirstRunMetrics()
  const processedCanonicalUrls = new Set<string>()

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
          fetchFailedPriorityClaimed: 0,
          fetchFailedPriorityAttempts: 0,
          fetchFailedPriorityPublished: 0,
          fetchFailedPriorityIngested: 0,
          fetchFailedPriorityFailed: 0,
          fetchFailedPriorityTerminalized: 0,
          fetchFailedPrioritySkippedCooldown: 0,
        },
      }
    }

    const wouldPublishUrls = await loadWouldPublishShadowCanonicalUrls(admin)
    const fetchFailedCandidates = await fetchMissingIngestFetchFailedCandidates(admin, {
      limit: MISSING_INGEST_FETCH_FAILED_MAX_CLAIM_PER_RUN,
      nowMs: Date.now(),
      wouldPublishUrls,
    })
    fetchFailedPriorityClaimed = fetchFailedCandidates.length

    for (const candidate of fetchFailedCandidates) {
      if (detailFirstAttempts >= budgets.maxAttemptsPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break

      const outcome = await processMissingIngestCandidate({
        admin,
        candidate,
        publishedIndex,
        budgets,
        startedMs,
        detailFirstMetrics,
        onAttempt: () => {
          detailFirstAttempts += 1
          fetchFailedPriorityAttempts += 1
        },
        isFetchFailedReplay: true,
      })

      processedCanonicalUrls.add(candidate.canonicalUrl)
      if (outcome.kind === 'skipped_cooldown') {
        fetchFailedPrioritySkippedCooldown += 1
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
        fetchFailedPriorityPublished += 1
        continue
      }
      if (outcome.kind === 'ingested') {
        ingested += 1
        fetchFailedPriorityIngested += 1
        continue
      }
      if (outcome.kind === 'failed') {
        failed += 1
        fetchFailedPriorityFailed += 1
        continue
      }
      if (outcome.kind === 'terminalized') {
        failed += 1
        fetchFailedPriorityTerminalized += 1
      }
    }

    for (const candidate of page.candidates) {
      if (detailFirstAttempts >= budgets.maxAttemptsPerRun) break
      if (Date.now() - startedMs >= budgets.maxRuntimeMs) break
      if (processedCanonicalUrls.has(candidate.canonicalUrl)) continue

      if (
        !isEligibleForMissingIngestionRetry(candidate, Date.now(), budgets.failedRetryHours)
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
        },
        isFetchFailedReplay: false,
      })

      if (outcome.kind === 'skipped_cooldown') {
        skippedCooldown += 1
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
        continue
      }
      if (outcome.kind === 'ingested') {
        ingested += 1
        continue
      }
      if (outcome.kind === 'failed' || outcome.kind === 'terminalized') {
        failed += 1
      }
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
  missingIngestionReplayCount?: number
}

type ProcessMissingIngestOutcome =
  | { kind: 'skipped_cooldown' }
  | { kind: 'skipped_visible' }
  | { kind: 'skipped_existing' }
  | { kind: 'published' }
  | { kind: 'ingested' }
  | { kind: 'failed' }
  | { kind: 'terminalized' }

async function processMissingIngestCandidate(params: {
  admin: ReturnType<typeof getAdminDb>
  candidate: MissingIngestCandidateLike
  publishedIndex: Awaited<ReturnType<typeof loadLootAuraPublishedYstmIndex>>
  budgets: YstmCoverageMissingIngestionBudgets
  startedMs: number
  detailFirstMetrics: YstmDetailFirstRunMetrics
  onAttempt: () => void
  isFetchFailedReplay: boolean
}): Promise<ProcessMissingIngestOutcome> {
  const { admin, candidate, publishedIndex, detailFirstMetrics, onAttempt, isFetchFailedReplay } =
    params
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

  const { config, listSeed, rowPayload } = buildCoverageMissingIngestionContext({
    canonicalUrl: canonical,
    city: candidate.city,
    state: candidate.state,
  })

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
    lootauraVisible?: boolean
    missingIngestionReplayCount?: number
    missingIngestionLastRetryAt?: string | null
    resetFetchFailedReplay?: boolean
  }
): Promise<void> {
  await recordYstmCoverageMissingIngestionOutcome(admin, canonicalUrl, {
    outcome,
    failureReason: extra?.failureReason ?? null,
    lootauraVisible: extra?.lootauraVisible,
    missingIngestionReplayCount: extra?.missingIngestionReplayCount,
    missingIngestionLastRetryAt: extra?.missingIngestionLastRetryAt,
    resetFetchFailedReplay: extra?.resetFetchFailedReplay,
  })
}
