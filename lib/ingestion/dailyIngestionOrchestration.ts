import { createHash } from 'crypto'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import {
  enrichPendingAddresses,
  type AddressEnrichmentWorkerSummary,
} from '@/lib/ingestion/addressEnrichmentWorker'
import {
  enrichPendingImages,
  type ImageEnrichmentWorkerSummary,
} from '@/lib/ingestion/imageEnrichmentWorker'
import {
  runNativeCoordinateRemediation,
  type NativeCoordinateRemediationSummary,
} from '@/lib/ingestion/nativeCoordinateRemediationWorker'
import { geocodePendingSales, type GeocodeWorkerSummary } from '@/lib/ingestion/geocodeWorker'
import { runWithGeocodePipelineLease } from '@/lib/ingestion/geocodePipelineLease'
import {
  finalizeLinkedPublishedIngestedSales,
  publishReadyIngestedSales,
  type PublishWorkerBatchSummary,
} from '@/lib/ingestion/publishWorker'
import {
  fetchLastSuccessfulExternalIngestionAt,
  recordIngestionOrchestrationRun,
  type ExternalIngestionOrchestrationNote,
} from '@/lib/ingestion/orchestrationMetrics'
import { adaptiveNoteToOrchestrationPayload } from '@/lib/ingestion/adaptiveThroughputProfile'
import { resolveAdaptiveThroughputForCron } from '@/lib/ingestion/adaptiveThroughputSignals'
import {
  normalizeSourcePages,
  persistExternalPageSource,
} from '@/lib/ingestion/adapters/externalPageSource'
import { partitionCrawlableExternalCityConfigs } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import {
  mergeEsnetTotalsIntoIngestionStep,
  runEsnetPlatformIngestionCronBatch,
} from '@/lib/ingestion/estatesalesnet/runEsnetPlatformIngestionCronBatch'
import {
  fetchEnabledExternalIngestionCityConfigs,
  recordConfigCrawlStats,
} from '@/lib/ingestion/acquisition/configCrawlStats'
import { detailFirstOrchestrationFields } from '@/lib/ingestion/acquisition/detailFirstOrchestrationFields'
import { mergeDetailFirstInsertFailedByDbCode } from '@/lib/ingestion/acquisition/ystmDetailFirstReady'
import { mergeDetailFirstFallbackReasonCounts } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'
import { freshAcquisitionOrchestrationFields } from '@/lib/ingestion/acquisition/freshAcquisitionOrchestrationFields'
import {
  emptyExternalCrawlSkipSubReasonCounts,
  mergeCrawlSkipSubReasonCounts,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import {
  buildYieldAwareCrawlPlan,
  type CrawlConfigRow,
} from '@/lib/ingestion/acquisition/yieldAwareCrawlSchedule'
import { createEmptyDedupeDecisionAggregate } from '@/lib/ingestion/dedupe'
import {
  acquireIngestionOrchestrationLease,
  releaseIngestionOrchestrationLease,
  type IngestionOrchestrationLease,
} from '@/lib/ingestion/ingestionOrchestrationLease'
import {
  filterConfigsForLane,
  laneNoteFields,
  type IngestionLaneContext,
} from '@/lib/ingestion/ingestionLanes'

function parseExternalFetchJitterRangeMs(): { minMs: number; maxMs: number } {
  const rawMin = process.env.EXTERNAL_FETCH_JITTER_MIN_MS
  const rawMax = process.env.EXTERNAL_FETCH_JITTER_MAX_MS
  const defaultMin = 300
  const defaultMax = 800
  const parsedMin = rawMin === undefined || rawMin === '' ? defaultMin : Number.parseInt(rawMin, 10)
  const parsedMax = rawMax === undefined || rawMax === '' ? defaultMax : Number.parseInt(rawMax, 10)
  const safeMin = Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : defaultMin
  const safeMax = Number.isFinite(parsedMax) && parsedMax >= safeMin ? parsedMax : defaultMax
  return { minMs: Math.min(safeMin, 60_000), maxMs: Math.min(Math.max(safeMax, safeMin), 60_000) }
}

function hashStringShort(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function hashStringToUint32(input: string): number {
  const digest = createHash('sha256').update(input).digest()
  return digest.readUInt32BE(0)
}

function makeSeededPrng(seed: number): () => number {
  let state = seed >>> 0
  if (state === 0) state = 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ExternalConfigRow = CrawlConfigRow & {
  source_discovery_status?: string | null
}

export async function runIngestionOrchestration(
  withOpId: (context?: any) => any,
  mode: 'daily' | 'ingestion',
  telemetryContext: Record<string, unknown>,
  laneContext: IngestionLaneContext
): Promise<any> {
  const orchestrationStartedAt = Date.now()
  const leaseLogContext = {
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    laneKey: laneContext.lane.laneKey,
    stateKey: laneContext.lane.stateKey,
    laneModeEnabled: laneContext.laneModeEnabled,
    rotationApplied: laneContext.rotationApplied,
  }
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.orchestrationStarted, {
      ...telemetryContext,
      mode,
      laneKey: laneContext.lane.laneKey,
    })
  )
  logger.info('Starting ingestion orchestration task', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    mode,
    laneKey: laneContext.lane.laneKey,
    stateKey: laneContext.lane.stateKey,
  }))

  const taskResult: any = {
    ok: true,
    steps: {},
    lane: {
      laneKey: laneContext.lane.laneKey,
      laneType: laneContext.lane.laneType,
      laneRegion: laneContext.lane.laneRegion,
      rotationApplied: laneContext.rotationApplied,
    },
  }

  let addressEnrichmentSummary: AddressEnrichmentWorkerSummary | null = null
  let imageEnrichmentSummary: ImageEnrichmentWorkerSummary | null = null
  let nativeCoordSummary: NativeCoordinateRemediationSummary | null = null
  let geocodeSummary: GeocodeWorkerSummary | null = null
  let publishSummary: PublishWorkerBatchSummary | null = null
  let publishDuplicateReuseCount = 0
  let externalIngestionNote: ExternalIngestionOrchestrationNote | null = null
  const ingestionDedupeTelemetrySummary = createEmptyDedupeDecisionAggregate()

  const { envelope: adaptiveEnvelope, note: adaptiveNote } = await resolveAdaptiveThroughputForCron(undefined, {
    laneContext,
  })
  const adaptivePayload = adaptiveNoteToOrchestrationPayload(adaptiveNote)
  taskResult.adaptive = adaptiveNote
  const laneBaseNote = () =>
    laneNoteFields(laneContext.lane, {
      laneAdaptiveProfile: adaptiveNote.adaptiveProfile,
    })
  const attachAdaptive = <T extends ExternalIngestionOrchestrationNote>(note: T): T => ({
    ...note,
    ...laneBaseNote(),
    adaptive: adaptivePayload,
  })

  const minIngestionMinutes =
    mode === 'ingestion' ? adaptiveEnvelope.fetch.minIntervalMinutes : 0
  let skipExternalIngestion = false

  if (mode === 'ingestion' && minIngestionMinutes > 0) {
    const lastCompletedAt = await fetchLastSuccessfulExternalIngestionAt(
      laneContext.laneModeEnabled ? laneContext.lane.laneKey : null
    )
    if (lastCompletedAt) {
      const elapsedMs = Date.now() - Date.parse(lastCompletedAt)
      const minMs = minIngestionMinutes * 60_000
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < minMs) {
        skipExternalIngestion = true
        taskResult.steps.ingestion = {
          ok: true,
          skipped: true,
          reason: 'ingestion_interval',
          minIntervalMinutes: minIngestionMinutes,
          lastSuccessfulExternalIngestionAt: lastCompletedAt,
          dedupeTelemetrySummary: ingestionDedupeTelemetrySummary,
        }
        externalIngestionNote = attachAdaptive({
          status: 'skipped_throttle',
          reason: 'ingestion_interval',
          minIntervalMinutes: minIngestionMinutes,
          lastSuccessfulExternalIngestionAt: lastCompletedAt,
        })
        logger.info('Ingestion step skipped (min interval not elapsed)', withOpId({
          component: 'api/cron/daily',
          task: 'ingestion-orchestration',
          step: 'ingestion',
          minIntervalMinutes: minIngestionMinutes,
          lastSuccessfulExternalIngestionAt: lastCompletedAt,
        }))
        logger.warn('Ingestion orchestration early skip due to throttle window', withOpId({
          component: 'api/cron/daily',
          task: 'ingestion-orchestration',
          step: 'ingestion',
          operation: 'skip_throttled',
          minIntervalMinutes: minIngestionMinutes,
        }))
      }
    }
  }

  // Step 1: External page source â€” config-driven list URLs per enabled city row; geocode/publish follow in later steps.
  if (!skipExternalIngestion) {
    let acquiredLease: IngestionOrchestrationLease | null = null
    let lockHeld = false
    let nextCursor = 0
    let markCompleted = false
    let externalFetchDurationMs: number | undefined
    try {
      logger.info('Ingestion step started', withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'ingestion',
      }))

      acquiredLease = await acquireIngestionOrchestrationLease(laneContext.lane.stateKey, withOpId(leaseLogContext))
      if (!acquiredLease.acquired) {
        taskResult.steps.ingestion = {
          ok: true,
          skipped: true,
          reason: 'active_orchestration_lock',
          dedupeTelemetrySummary: ingestionDedupeTelemetrySummary,
        }
        externalIngestionNote = attachAdaptive({
          status: 'skipped_lock_active',
          overlapPrevented: true,
          lockSkipped: true,
          laneOverlapPrevented: true,
        })
        logger.info('Ingestion step skipped due to active orchestration lease', withOpId({
          component: 'api/cron/daily',
          task: 'ingestion-orchestration',
          step: 'ingestion',
          operation: 'lease_skip',
          reason: acquiredLease.reason,
        }))
      } else {
        lockHeld = true
      }

      if (!lockHeld) {
        throw new Error('__LOCK_SKIP__')
      }

      const adminDb = getAdminDb()
      const { data: enabledCities, error: cityError } =
        await fetchEnabledExternalIngestionCityConfigs(adminDb)

      if (cityError) {
        throw new Error(cityError.message || 'Failed to load ingestion city configs')
      }

      const totals = {
        fetched: 0,
        inserted: 0,
        skipped: 0,
        invalid: 0,
        errors: 0,
        configsProcessed: 0,
        pagesProcessed: 0,
        skippedExpired: 0,
        freshInserted: 0,
        duplicateExistingUrl: 0,
        duplicateCrossCityPage: 0,
        duplicateCanonicalCollision: 0,
        duplicateExpiredRow: 0,
        ystmDetailFirstAttempted: 0,
        ystmDetailFirstSucceeded: 0,
        ystmDetailFirstPublished: 0,
        ystmDetailFirstFallback: 0,
        ystmDetailFirstFetchFailed: 0,
        ystmDetailFirstMsSamples: [] as number[],
        ystmDetailFirstRejectedByReason: {} as Record<string, number>,
        detailFirstAddressFromDetailPage: 0,
        detailFirstAddressFromListSeed: 0,
        ystmDetailFirstInsertFailedByDbCode: {} as Record<string, number>,
        crawlSkipSubReasons: emptyExternalCrawlSkipSubReasonCounts(),
      }

      const externalRows = ((enabledCities || []) as ExternalConfigRow[]).filter(
        (row) => row.source_platform === 'external_page_source'
      )
      const crawlablePartition = partitionCrawlableExternalCityConfigs(externalRows)
      const configsCrawlable = crawlablePartition.configsCrawlable
      const configsSkippedNoSourcePages = crawlablePartition.configsSkippedNoSourcePages
      const configsSkippedInvalidUrls = crawlablePartition.configsSkippedInvalidUrls
      const configsSkippedCrawlExcluded = crawlablePartition.configsSkippedCrawlExcluded

      const laneCrawlable = laneContext.laneModeEnabled
        ? filterConfigsForLane(crawlablePartition.crawlable, laneContext.lane)
        : crawlablePartition.crawlable
      const plannedRows = buildYieldAwareCrawlPlan(laneCrawlable as CrawlConfigRow[])
      const totalConfigs = plannedRows.length
      const batchSize = adaptiveEnvelope.fetch.configBatchSize
      const executionBudgetMs = adaptiveEnvelope.fetch.executionBudgetMs
      const budgetStartedAtMs = Date.now()
      const laneCursorBefore =
        totalConfigs > 0 && acquiredLease
          ? ((acquiredLease.cursor % totalConfigs) + totalConfigs) % totalConfigs
          : 0
      const baseCursor = laneCursorBefore
      const cappedCount = Math.min(batchSize, totalConfigs)
      const boundedRows =
        totalConfigs === 0
          ? []
          : Array.from({ length: cappedCount }, (_, offset) => plannedRows[(baseCursor + offset) % totalConfigs])
      let budgetExited = false
      let configsConsumed = 0
      let configsSkippedInvalidPages = 0
      const domainMinSpacingMs = adaptiveEnvelope.fetch.domainSpacingMs
      const jitterRangeMs = parseExternalFetchJitterRangeMs()
      const jitterSeedString = `ingestion:${mode}:${new Date().toISOString()}`
      const jitterSeed = hashStringToUint32(jitterSeedString)
      const nextRandom = makeSeededPrng(jitterSeed)
      const lastRequestAtByDomain = new Map<string, number>()
      const requestsByDomain = new Map<string, number>()
      const externalFetchStartedAtMs = Date.now()

      logger.info('Ingestion external fetch pacing initialized', withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'ingestion',
        adapter: 'external_page_source',
        domainMinSpacingMs,
        jitterMinMs: jitterRangeMs.minMs,
        jitterMaxMs: jitterRangeMs.maxMs,
        jitterSeedHash: hashStringShort(jitterSeedString),
        totalConfigs,
        configsCrawlable,
        configsSkippedNoSourcePages,
        configsSkippedInvalidUrls,
        configsSkippedCrawlExcluded,
        batchSize,
        baseCursor,
        boundedConfigs: boundedRows.length,
        executionBudgetMs,
      }))

      for (const row of boundedRows) {
        const elapsedMs = Date.now() - budgetStartedAtMs
        if (elapsedMs >= executionBudgetMs) {
          budgetExited = true
          logger.warn('Ingestion budget reached before processing remaining bounded configs', withOpId({
            component: 'api/cron/daily',
            task: 'ingestion-orchestration',
            step: 'ingestion',
            operation: 'execution_budget_exit',
            elapsedMs,
            executionBudgetMs,
          }))
          break
        }
        configsConsumed += 1
        const pages = normalizeSourcePages(row.source_pages)
        if (pages.length === 0) {
          configsSkippedInvalidPages += 1
          logger.warn('External page source: skipping config â€” crawlable filter bypass (invalid URLs at processing time)', {
            component: 'api/cron/daily',
            task: 'ingestion-orchestration',
            step: 'ingestion',
            city: row.city,
            state: row.state,
            adapter: 'external_page_source',
          })
          continue
        }
        totals.configsProcessed += 1
        const s = await persistExternalPageSource(
          {
            city: row.city,
            state: row.state,
            source_platform: row.source_platform,
            source_pages: row.source_pages,
          },
          {
            telemetryContext: telemetryContext,
            beforePageFetch: async ({ pageUrl, pageIndex, city, state }) => {
              let domain = 'unknown-host'
              try {
                domain = new URL(pageUrl).hostname.toLowerCase()
              } catch {
                // URL validation happens inside safe fetch; fallback keeps pacing logs non-PII.
              }
              const now = Date.now()
              const last = lastRequestAtByDomain.get(domain)
              const sameDomainDelayMs =
                last === undefined ? 0 : Math.max(0, last + domainMinSpacingMs - now)
              const jitterSpan = jitterRangeMs.maxMs - jitterRangeMs.minMs
              const jitterDelayMs =
                jitterRangeMs.minMs + Math.floor(nextRandom() * (jitterSpan + 1))
              const appliedDelayMs = sameDomainDelayMs + jitterDelayMs
              if (appliedDelayMs > 0) {
                await sleepMs(appliedDelayMs)
              }
              lastRequestAtByDomain.set(domain, Date.now())
              requestsByDomain.set(domain, (requestsByDomain.get(domain) ?? 0) + 1)

              logger.info('External fetch pacing applied', withOpId({
                component: 'api/cron/daily',
                task: 'ingestion-orchestration',
                step: 'ingestion',
                operation: 'external_fetch_pacing',
                adapter: 'external_page_source',
                city,
                state,
                pageIndex,
                domainHash: hashStringShort(domain),
                sameDomainDelayMs,
                jitterDelayMs,
                appliedDelayMs,
              }))
            },
          }
        )
        totals.fetched += s.fetched
        totals.inserted += s.inserted
        totals.skipped += s.skipped
        totals.invalid += s.invalid
        totals.errors += s.errors
        totals.pagesProcessed += s.pagesProcessed
        totals.skippedExpired += s.skippedExpired ?? 0
        totals.freshInserted += s.freshInserted ?? 0
        totals.duplicateExistingUrl += s.duplicateExistingUrl ?? 0
        totals.duplicateCrossCityPage += s.duplicateCrossCityPage ?? 0
        totals.duplicateCanonicalCollision += s.duplicateCanonicalCollision ?? 0
        totals.duplicateExpiredRow += s.duplicateExpiredRow ?? 0
        mergeCrawlSkipSubReasonCounts(
          totals.crawlSkipSubReasons,
          s.crawlSkipSubReasons ?? emptyExternalCrawlSkipSubReasonCounts()
        )
        totals.ystmDetailFirstAttempted += s.ystmDetailFirstAttempted ?? 0
        totals.ystmDetailFirstSucceeded += s.ystmDetailFirstSucceeded ?? 0
        totals.ystmDetailFirstPublished += s.ystmDetailFirstPublished ?? 0
        totals.ystmDetailFirstFallback += s.ystmDetailFirstFallback ?? 0
        totals.ystmDetailFirstFetchFailed += s.ystmDetailFirstFetchFailed ?? 0
        totals.ystmDetailFirstMsSamples.push(...(s.ystmDetailFirstMsToPublishedSamples ?? []))
        mergeDetailFirstFallbackReasonCounts(
          totals.ystmDetailFirstRejectedByReason,
          s.ystmDetailFirstFallbackByReason
        )
        totals.detailFirstAddressFromDetailPage += s.detailFirstAddressFromDetailPage ?? 0
        totals.detailFirstAddressFromListSeed += s.detailFirstAddressFromListSeed ?? 0
        mergeDetailFirstInsertFailedByDbCode(
          totals.ystmDetailFirstInsertFailedByDbCode,
          s.ystmDetailFirstInsertFailedByDbCode
        )

        ingestionDedupeTelemetrySummary.source_url += s.duplicateExistingUrl ?? 0
        ingestionDedupeTelemetrySummary.soft_date_window += s.duplicateCrossCityPage ?? 0
        ingestionDedupeTelemetrySummary.duplicateDecisionTrue +=
          (s.duplicateCrossCityPage ?? 0) + (s.duplicateExpiredRow ?? 0)

        await recordConfigCrawlStats({
          city: row.city,
          state: row.state,
          totals: {
            fetched: s.fetched,
            skipped: s.skipped,
            inserted: s.inserted,
            skippedExpired: s.skippedExpired,
            freshInserted: s.freshInserted,
            duplicateSkips: {
              duplicate_existing_url: s.duplicateExistingUrl,
              duplicate_cross_city_page: s.duplicateCrossCityPage,
              duplicate_canonical_collision: s.duplicateCanonicalCollision,
              duplicate_expired_row: s.duplicateExpiredRow,
            },
            detailFirstAttempted: s.ystmDetailFirstAttempted,
            detailFirstSucceeded: s.ystmDetailFirstSucceeded,
          },
        })
      }

      const esnetBatch = await runEsnetPlatformIngestionCronBatch({
        enabledRows: (enabledCities ?? []) as ExternalConfigRow[],
        budgetStartedAtMs,
        telemetryContext,
        beforePageFetch: async ({ pageUrl }) => {
          let domain = 'unknown-host'
          try {
            domain = new URL(pageUrl).hostname.toLowerCase()
          } catch {
            /* safe fetch validates URL */
          }
          const now = Date.now()
          const last = lastRequestAtByDomain.get(domain)
          const sameDomainDelayMs =
            last === undefined ? 0 : Math.max(0, last + domainMinSpacingMs - now)
          const jitterSpan = jitterRangeMs.maxMs - jitterRangeMs.minMs
          const jitterDelayMs =
            jitterRangeMs.minMs + Math.floor(nextRandom() * (jitterSpan + 1))
          const appliedDelayMs = sameDomainDelayMs + jitterDelayMs
          if (appliedDelayMs > 0) {
            await sleepMs(appliedDelayMs)
          }
          lastRequestAtByDomain.set(domain, Date.now())
          requestsByDomain.set(domain, (requestsByDomain.get(domain) ?? 0) + 1)
        },
      })
      if (esnetBatch.summary) {
        totals.fetched += esnetBatch.summary.fetched
        totals.inserted += esnetBatch.summary.inserted
        totals.skipped += esnetBatch.summary.skipped
        totals.invalid += esnetBatch.summary.invalid
        totals.errors += esnetBatch.summary.errors
        totals.pagesProcessed += esnetBatch.summary.pagesProcessed
        mergeCrawlSkipSubReasonCounts(totals.crawlSkipSubReasons, esnetBatch.summary.crawlSkipSubReasons)
      }

      nextCursor =
        totalConfigs > 0
          ? (baseCursor + configsConsumed) % totalConfigs
          : 0
      markCompleted = true
      const configsRemaining = Math.max(0, boundedRows.length - configsConsumed)

      taskResult.steps.ingestion = {
        ok: true,
        adapter: 'external_page_source',
        totalConfigs,
        configsCrawlable,
        configsSkippedNoSourcePages,
        configsSkippedInvalidUrls,
        configsSkippedCrawlExcluded,
        batchSize,
        configsConsumed,
        configsSkippedInvalidPages,
        configsRemaining,
        cursorStart: baseCursor,
        cursorNext: nextCursor,
        executionBudgetMs,
        executionBudgetExit: budgetExited,
        configsProcessed: totals.configsProcessed,
        pagesProcessed: totals.pagesProcessed,
        fetched: totals.fetched,
        inserted: totals.inserted,
        skipped: totals.skipped,
        invalid: totals.invalid,
        errors: totals.errors,
        ...freshAcquisitionOrchestrationFields(totals),
        ...detailFirstOrchestrationFields(
          {
            attempted: totals.ystmDetailFirstAttempted,
            succeeded: totals.ystmDetailFirstSucceeded,
            published: totals.ystmDetailFirstPublished,
            fallback: totals.ystmDetailFirstFallback,
            fetchFailed: totals.ystmDetailFirstFetchFailed,
            rejectedByReason: totals.ystmDetailFirstRejectedByReason,
            msToPublishedSamples: totals.ystmDetailFirstMsSamples,
            addressValidatedFromDetailPage: totals.detailFirstAddressFromDetailPage,
            addressValidatedFromListSeed: totals.detailFirstAddressFromListSeed,
            insertFailedByDbCode: totals.ystmDetailFirstInsertFailedByDbCode,
          },
          totals.freshInserted
        ),
        dedupeTelemetrySummary: ingestionDedupeTelemetrySummary,
        esnetIngestSkipped: esnetBatch.skipped,
        esnetIngestSkipReason: esnetBatch.skipReason ?? null,
      }
      if (esnetBatch.summary) {
        mergeEsnetTotalsIntoIngestionStep(taskResult.steps.ingestion, esnetBatch.summary)
      }

      const completedAt = new Date().toISOString()
      externalFetchDurationMs = Date.now() - externalFetchStartedAtMs
      externalIngestionNote = attachAdaptive({
        status: 'completed',
        completedAt,
        configsProcessed: totals.configsProcessed,
        configsConsumed,
        configsCrawlable: totalConfigs,
        configsSkippedNoSourcePages,
        configsSkippedInvalidUrls,
        configsSkippedCrawlExcluded,
        configsSkippedInvalidPages,
        configsRemaining,
        budgetExit: budgetExited,
        overlapPrevented: false,
        staleLockRecovered: acquiredLease?.staleRecovered ?? false,
        laneConfigsCrawlable: totalConfigs,
        laneConfigsProcessed: totals.configsProcessed,
        laneConfigsRemaining: configsRemaining,
        laneCursorBefore,
        laneCursorAfter: nextCursor,
        laneOverlapPrevented: false,
        laneStaleLockRecovered: acquiredLease?.staleRecovered ?? false,
        pagesProcessed: totals.pagesProcessed,
        fetched: totals.fetched,
        inserted: totals.inserted,
        skipped: totals.skipped,
        invalid: totals.invalid,
        errors: totals.errors,
        ...freshAcquisitionOrchestrationFields(totals),
        ...detailFirstOrchestrationFields(
          {
            attempted: totals.ystmDetailFirstAttempted,
            succeeded: totals.ystmDetailFirstSucceeded,
            published: totals.ystmDetailFirstPublished,
            fallback: totals.ystmDetailFirstFallback,
            fetchFailed: totals.ystmDetailFirstFetchFailed,
            rejectedByReason: totals.ystmDetailFirstRejectedByReason,
            msToPublishedSamples: totals.ystmDetailFirstMsSamples,
            addressValidatedFromDetailPage: totals.detailFirstAddressFromDetailPage,
            addressValidatedFromListSeed: totals.detailFirstAddressFromListSeed,
            insertFailedByDbCode: totals.ystmDetailFirstInsertFailedByDbCode,
          },
          totals.freshInserted
        ),
        dedupeTelemetrySummary: {
          source_url: ingestionDedupeTelemetrySummary.source_url,
          exact_address_date: ingestionDedupeTelemetrySummary.exact_address_date,
          soft_date_window: ingestionDedupeTelemetrySummary.soft_date_window,
          soft_duplicate_rejected: ingestionDedupeTelemetrySummary.soft_duplicate_rejected,
          no_match: ingestionDedupeTelemetrySummary.no_match,
          duplicateDecisionTrue: ingestionDedupeTelemetrySummary.duplicateDecisionTrue,
          duplicateDecisionFalse: ingestionDedupeTelemetrySummary.duplicateDecisionFalse,
        },
        externalFetchDurationMs,
      })

      logger.info('Ingestion step completed', withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'ingestion',
        adapter: 'external_page_source',
        configsProcessed: totals.configsProcessed,
        configsConsumed,
        configsCrawlable,
        configsSkippedNoSourcePages,
        configsSkippedInvalidUrls,
        configsSkippedCrawlExcluded,
        configsSkippedInvalidPages,
        pagesProcessed: totals.pagesProcessed,
        fetched: totals.fetched,
        inserted: totals.inserted,
        skipped: totals.skipped,
        invalid: totals.invalid,
        errors: totals.errors,
        dedupeTelemetrySummary: ingestionDedupeTelemetrySummary,
        totalConfigs,
        configsRemaining,
        cursorStart: baseCursor,
        cursorNext: nextCursor,
        executionBudgetExit: budgetExited,
      }))
      for (const [domain, count] of requestsByDomain.entries()) {
        logger.info('External fetch domain request totals', withOpId({
          component: 'api/cron/daily',
          task: 'ingestion-orchestration',
          step: 'ingestion',
          operation: 'external_fetch_domain_totals',
          adapter: 'external_page_source',
          domainHash: hashStringShort(domain),
          requestCount: count,
        }))
      }
      if (acquiredLease?.staleRecovered) {
        logger.warn('Recovered stale orchestration lock before ingestion execution', withOpId({
          component: 'api/cron/daily',
          task: 'ingestion-orchestration',
          step: 'ingestion',
          operation: 'stale_lock_recovery',
        }))
      }
    } catch (error) {
      if (error instanceof Error && error.message === '__LOCK_SKIP__') {
        // Intentional no-op; lock-active skip already recorded.
        logger.warn('Ingestion orchestration early skip due to active lease', withOpId({
          component: 'api/cron/daily',
          task: 'ingestion-orchestration',
          step: 'ingestion',
          operation: 'skip_active_lease',
        }))
      } else {
      taskResult.ok = false
      taskResult.steps.ingestion = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        dedupeTelemetrySummary: ingestionDedupeTelemetrySummary,
      }
      externalIngestionNote = attachAdaptive({ status: 'failed' })
      logger.error('Ingestion step failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'ingestion',
      }))
      }
    } finally {
      if (lockHeld && acquiredLease) {
        await releaseIngestionOrchestrationLease(laneContext.lane.stateKey, withOpId(leaseLogContext), {
          owner: acquiredLease.owner,
          nextCursor,
          markCompleted,
        })
      }
    }
  }

  const geoPublishStartMs = Date.now()

  // Step 2: Address enrichment (D1) before geocode.
  try {
    const enrichmentBatchSize = Math.min(
      adaptiveEnvelope.geocode.backlogBatchSize,
      parseInt(process.env.ADDRESS_ENRICHMENT_BACKLOG_BATCH_SIZE ?? '25', 10) || 25
    )
    logger.info('Address enrichment step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'address_enrichment',
      enrichmentBatchSize,
    }))
    addressEnrichmentSummary = await enrichPendingAddresses({
      batchSizeOverride: enrichmentBatchSize,
      telemetryContext: telemetryContext,
    })
    taskResult.steps.address_enrichment = {
      ok: true,
      enrichmentBatchSize,
      ...addressEnrichmentSummary,
    }
    logger.info('Address enrichment step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'address_enrichment',
      ...addressEnrichmentSummary,
    }))
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.address_enrichment = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error(
      'Address enrichment step failed',
      error instanceof Error ? error : new Error(String(error)),
      withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'address_enrichment',
      })
    )
  }

  // Step 2b: Image enrichment (D2.5) â€” detail mediaStr for rows missing images.
  try {
    const imageBatchSize = Math.min(
      adaptiveEnvelope.geocode.backlogBatchSize,
      parseInt(process.env.IMAGE_ENRICHMENT_BACKLOG_BATCH_SIZE ?? '25', 10) || 25
    )
    logger.info('Image enrichment step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'image_enrichment',
      imageBatchSize,
    }))
    imageEnrichmentSummary = await enrichPendingImages({
      batchSizeOverride: imageBatchSize,
      telemetryContext: telemetryContext,
    })
    taskResult.steps.image_enrichment = {
      ok: true,
      imageBatchSize,
      ...imageEnrichmentSummary,
    }
    logger.info('Image enrichment step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'image_enrichment',
      ...imageEnrichmentSummary,
    }))
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.image_enrichment = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error(
      'Image enrichment step failed',
      error instanceof Error ? error : new Error(String(error)),
      withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'image_enrichment',
      })
    )
  }

  // Step 3: YSTM native coordinate remediation (before geocode).
  try {
    const nativeBatchSize = Math.min(
      adaptiveEnvelope.geocode.backlogBatchSize,
      parseInt(process.env.NATIVE_COORD_REMEDIATION_BATCH_SIZE ?? '75', 10) || 75
    )
    logger.info('Native coordinate remediation step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'native_coordinate_remediation',
      nativeBatchSize,
    }))
    nativeCoordSummary = await runNativeCoordinateRemediation({
      batchSizeOverride: nativeBatchSize,
      telemetryContext: telemetryContext,
    })
    taskResult.steps.native_coordinate_remediation = {
      ok: true,
      nativeBatchSize,
      ...nativeCoordSummary,
    }
    logger.info('Native coordinate remediation step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'native_coordinate_remediation',
      ...nativeCoordSummary,
    }))
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.native_coordinate_remediation = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error(
      'Native coordinate remediation step failed',
      error instanceof Error ? error : new Error(String(error)),
      withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'native_coordinate_remediation',
      })
    )
  }

  // Step 4: Geocode pending sales.
  try {
    const backlogBatchSize = adaptiveEnvelope.geocode.backlogBatchSize
    logger.info('Geocode step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'geocode',
      backlogBatchSize,
    }))
    const geocodeLease = await runWithGeocodePipelineLease({
      logContext: withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'geocode',
      }),
      execute: () =>
        geocodePendingSales({
          batchSizeOverride: backlogBatchSize,
          concurrencyCeilingOverride: adaptiveEnvelope.geocode.concurrencyCeiling,
          telemetryContext: telemetryContext,
        }),
    })
    if (geocodeLease.skipped) {
      geocodeSummary = {
        claimed: 0,
        succeeded: 0,
        failedRetriable: 0,
        failedTerminal: 0,
        rate429Count: 0,
        processed: 0,
        publishTriggered: 0,
        publishOk: 0,
        publishFailed: 0,
      }
      taskResult.steps.geocode = {
        ok: true,
        backlogBatchSize,
        skippedDueToPipelineLease: true,
        pipelineLeaseReason: geocodeLease.reason,
        ...geocodeSummary,
      }
    } else {
      geocodeSummary = geocodeLease.result
      taskResult.steps.geocode = {
        ok: true,
        backlogBatchSize,
        ...geocodeSummary,
      }
    }
    logger.info('Geocode step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'geocode',
      ...geocodeSummary,
    }))
    if (geocodeSummary.claimed === 0) {
      logger.warn('Geocode step claimed zero rows', withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'geocode',
        operation: 'claim_zero',
      }))
    }
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.geocode = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error('Geocode step failed', error instanceof Error ? error : new Error(String(error)), withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'geocode',
    }))
  }

  // Step 4: Publish ready ingested sales.
  try {
    logger.info('Publish step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
    }))
    publishSummary = await publishReadyIngestedSales({
      telemetryContext: telemetryContext,
      batchSizeOverride: adaptiveEnvelope.publish.batchSize,
    })
    const linkedFinalizeSummary = await finalizeLinkedPublishedIngestedSales()
    publishDuplicateReuseCount = linkedFinalizeSummary.alreadyPublished
    taskResult.steps.publish = {
      ok: true,
      ...publishSummary,
      linkedFinalize: linkedFinalizeSummary,
    }
    logger.info('Publish step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
      ...publishSummary,
      linkedFinalize: linkedFinalizeSummary,
    }))
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.publish = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error('Publish step failed', error instanceof Error ? error : new Error(String(error)), withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
    }))
  }

  const orchestrationGeoPublishDurationMs = Date.now() - geoPublishStartMs
  if (externalIngestionNote && publishDuplicateReuseCount > 0) {
    externalIngestionNote = {
      ...externalIngestionNote,
      publishDuplicateReuseCount,
    }
  }
  await recordIngestionOrchestrationRun({
    mode,
    orchestrationGeoPublishDurationMs,
    geocodeSummary,
    publishSummary,
    externalIngestion: externalIngestionNote,
    adaptiveNote: adaptivePayload,
    effectiveGeocodeBacklogBatch: adaptiveEnvelope.geocode.backlogBatchSize,
    effectiveGeocodeConcurrency: adaptiveEnvelope.geocode.concurrencyCeiling,
  })

  logger.info('Ingestion orchestration task completed', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    durationMs: Date.now() - orchestrationStartedAt,
    result: taskResult,
  }))

  taskResult.duration_ms = Date.now() - orchestrationStartedAt
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.orchestrationCompleted, {
      ...telemetryContext,
      mode,
      ok: taskResult.ok,
      durationMs: taskResult.duration_ms,
      geocodeClaimed: geocodeSummary?.claimed ?? null,
      publishAttempted: publishSummary?.attempted ?? null,
      externalIngestionSkipped: Boolean(taskResult.steps.ingestion?.skipped),
    })
  )
  return taskResult
}

export type DailyIngestionOrchestrationResult = Awaited<ReturnType<typeof runIngestionOrchestration>>

