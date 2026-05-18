/**
 * GET /api/cron/daily
 * POST /api/cron/daily
 * 
 * Unified daily cron endpoint that handles multiple daily tasks:
 * 1. Auto-archive sales that have ended (SQL-batched RPC; transitional legacy when ends_at is null)
 * 2. Expire promotions that have ended
 * 3. Send favorite sales starting soon emails
 * 4. Send weekly moderation digest (Fridays only)
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * It should be called by a scheduled job (Vercel Cron, Supabase Cron, etc.)
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Daily at 02:00 UTC
 * - Purpose: Archive ended sales and send favorite sale reminders
 *
 * Query `?mode=ingestion` runs ingestion orchestration (external fetch + geocode + publish),
 * skipping archive, promotions, emails, and moderation digest. Omit `mode` for full daily.
 * High-frequency `mode=ingestion` crons throttle the external fetch step to at most once per
 * `INGESTION_ORCHESTRATION_MIN_MINUTES` (default 30); geocode and publish always run.
 *
 * Ingestion geocode step: bounded DB backlog only —
 * `geocodePendingSales({ batchSizeOverride })` using `GEOCODE_BACKLOG_BATCH_SIZE` (default 15, cap 100).
 * Shares the `geocode_pipeline` lease with `/api/cron/geocode` to prevent overlapping drains.
 * Does not pass `captureClaimedRowIds` (cron geocode route owns that for observability).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
import { sendModerationDailyDigestEmail } from '@/lib/email/moderationDigest'
import { logger, generateOperationId } from '@/lib/log'
import { createCorrelationBundle } from '@/lib/observability/correlation'
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
  fetchEnabledExternalIngestionCityConfigs,
  recordConfigCrawlStats,
} from '@/lib/ingestion/acquisition/configCrawlStats'
import { detailFirstOrchestrationFields } from '@/lib/ingestion/acquisition/detailFirstOrchestrationFields'
import { freshAcquisitionOrchestrationFields } from '@/lib/ingestion/acquisition/freshAcquisitionOrchestrationFields'
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
import { resolveIngestionLaneContext } from '@/lib/ingestion/resolveIngestionLaneContext'
import { runArchiveEndedSalesJob } from '@/lib/sales/archiveEndedSalesSqlBatch'
import type { ReportDigestItem } from '@/lib/email/templates/ModerationDailyDigestEmail'

export const dynamic = 'force-dynamic'

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

export async function GET(request: NextRequest) {
  return handleRequest(request)
}

export async function POST(request: NextRequest) {
  return handleRequest(request)
}

function deriveCronHealthFromIngestionTask(task: any, durationMs: number, environment: string) {
  const geocode = task?.steps?.geocode
  const publish = task?.steps?.publish
  const claimed = Number(geocode?.claimed ?? 0)
  const geocodeFailed = Number(geocode?.failedRetriable ?? 0) + Number(geocode?.failedTerminal ?? 0)
  const processed = Number(geocode?.succeeded ?? 0) + geocodeFailed
  const publishFailed = Number(publish?.failed ?? 0)
  return {
    claimed,
    processed,
    failed: geocodeFailed + publishFailed,
    duration_ms: durationMs,
    environment,
  }
}

async function handleRequest(request: NextRequest) {
  const runAt = new Date().toISOString()
  const env = process.env.NODE_ENV || 'development'
  const deploymentEnv = process.env.VERCEL_ENV || 'unknown'
  const startedAt = Date.now()
  const opId = generateOperationId()
  const correlation = createCorrelationBundle({ requestId: opId, operationId: opId })
  const withOpId = (context: any = {}) => ({
    ...context,
    requestId: correlation.requestId,
    operationId: correlation.operationId,
    correlationId: correlation.correlationId,
  })

  logger.info('Daily cron route hit', withOpId({
    component: 'api/cron/daily',
    operation: 'route_hit',
    method: request.method,
    route: request.nextUrl.pathname,
    search: request.nextUrl.search,
    env,
    deploymentEnv,
    runAt,
  }))

  try {
    // Validate cron authentication
    try {
      assertCronAuthorized(request)
    } catch (error) {
      // assertCronAuthorized throws NextResponse if unauthorized or misconfigured
      if (error instanceof NextResponse) {
        logger.warn('Daily cron exited early due to auth failure', withOpId({
          component: 'api/cron/daily',
          operation: 'auth_failed_early_exit',
          mode: request.nextUrl.searchParams.get('mode') === 'ingestion' ? 'ingestion' : 'daily',
          env,
          deploymentEnv,
          durationMs: Date.now() - startedAt,
        }))
        emitObservabilityRecord(
          buildTelemetryRecord(ObservabilityEvents.api.cronDailyHit, {
            requestId: correlation.requestId,
            operationId: correlation.operationId,
            correlationId: correlation.correlationId,
            jobType: 'cron.daily',
            phase: 'auth_failed',
            durationMs: Date.now() - startedAt,
          })
        )
        return error
      }
      // If it's not a NextResponse, rethrow
      throw error
    }

    const cronModeParam = request.nextUrl.searchParams.get('mode')
    const isIngestionOnly = cronModeParam === 'ingestion'
    const mode = isIngestionOnly ? 'ingestion' : 'daily'
    const jobTypeLabel = isIngestionOnly ? 'cron.daily.ingestion_only' : 'cron.daily.full'
    const orchestrationTelemetry: Record<string, unknown> = {
      requestId: correlation.requestId,
      operationId: correlation.operationId,
      correlationId: correlation.correlationId,
      jobType: 'ingestion.orchestration',
      cronMode: mode,
    }

    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.api.cronDailyHit, {
        requestId: correlation.requestId,
        operationId: correlation.operationId,
        correlationId: correlation.correlationId,
        jobType: jobTypeLabel,
        phase: 'authenticated',
        mode,
        durationMs: Date.now() - startedAt,
      })
    )

    logger.info('Daily cron job triggered', withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
      mode,
    }))

    const results: any = {
      ok: true,
      job: 'daily',
      mode,
      runAt,
      env,
      tasks: {},
    }

    if (isIngestionOnly) {
      results.tasksRan = ['ingestionOrchestration'] as const
      const laneParam = request.nextUrl.searchParams.get('lane')
      const laneResolved = await resolveIngestionLaneContext({ mode: 'ingestion', laneParam })
      if (!laneResolved.ok) {
        results.ok = false
        results.tasks.ingestionOrchestration = {
          ok: false,
          error: laneResolved.message,
          code: laneResolved.code,
        }
        return NextResponse.json(results, { status: laneResolved.status })
      }
      try {
        const ingestionOrchestrationResult = await runIngestionOrchestration(
          withOpId,
          'ingestion',
          orchestrationTelemetry,
          laneResolved.context
        )
        results.tasks.ingestionOrchestration = ingestionOrchestrationResult
      } catch (error) {
        logger.error('Ingestion orchestration task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
          component: 'api/cron/daily',
          task: 'ingestion-orchestration',
        }))
        results.tasks.ingestionOrchestration = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }

      const hasSuccess = results.tasks.ingestionOrchestration?.ok === true
      if (!hasSuccess) {
        results.ok = false
      }

      logger.info('Daily cron job completed (ingestion-only)', withOpId({
        component: 'api/cron/daily',
        runAt,
        env,
        mode,
        results,
      }))

      const durationMs = Date.now() - startedAt
      results.health = deriveCronHealthFromIngestionTask(results.tasks.ingestionOrchestration, durationMs, env)
      results.duration_ms = durationMs
      results.deployment_environment = deploymentEnv
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.api.cronDailyHit, {
          requestId: correlation.requestId,
          operationId: correlation.operationId,
          correlationId: correlation.correlationId,
          jobType: jobTypeLabel,
          phase: 'response',
          mode,
          httpStatus: results.ok ? 200 : 500,
          resultsOk: results.ok,
          durationMs,
        })
      )
      return NextResponse.json(results, { status: results.ok ? 200 : 500 })
    }

    // Task 1: Auto-archive sales that have ended
    try {
      const archiveResult = await runArchiveEndedSalesJob({
        logBase: withOpId({ task: 'archive-sales' }),
        telemetryContext: {
          requestId: correlation.requestId,
          operationId: correlation.operationId,
          correlationId: correlation.correlationId,
          jobType: 'archive.sales',
        },
      })
      results.tasks.archiveSales = archiveResult
    } catch (error) {
      logger.error('Archive sales task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'archive-sales',
      }))
      results.tasks.archiveSales = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 2: Expire promotions that have ended
    try {
      const expireResult = await expireEndedPromotions(withOpId)
      results.tasks.expirePromotions = expireResult
    } catch (error) {
      logger.error('Expire promotions task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'expire-promotions',
      }))
      results.tasks.expirePromotions = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 3: Send favorite sales starting soon emails
    try {
      const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
      if (!emailsEnabled) {
        logger.info('Favorite sales starting soon task skipped - emails disabled', withOpId({
          component: 'api/cron/daily',
          task: 'favorites-starting-soon',
        }))
        results.tasks.favoritesStartingSoon = {
          ok: true,
          skipped: true,
          reason: 'emails_disabled',
        }
      } else {
        const favoritesResult = await processFavoriteSalesStartingSoonJob({})
        results.tasks.favoritesStartingSoon = {
          ok: favoritesResult.success,
          error: favoritesResult.error,
        }
      }
    } catch (error) {
      logger.error('Favorites starting soon task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'favorites-starting-soon',
      }))
      results.tasks.favoritesStartingSoon = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 4: Send weekly moderation digest (only on Fridays)
    const currentDay = new Date().getUTCDay() // 0 = Sunday, 5 = Friday
    if (currentDay === 5) {
      try {
        const moderationResult = await sendWeeklyModerationDigest(withOpId)
        results.tasks.moderationDigest = moderationResult
      } catch (error) {
        logger.error('Moderation digest task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
          component: 'api/cron/daily',
          task: 'moderation-digest',
        }))
        results.tasks.moderationDigest = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    } else {
      results.tasks.moderationDigest = {
        ok: true,
        skipped: true,
        reason: 'not_friday',
      }
    }

    // Task 5: Ingestion orchestration (ingestion -> geocode -> publish)
    try {
      const dailyLaneResolved = await resolveIngestionLaneContext({
        mode: 'daily',
        laneParam: request.nextUrl.searchParams.get('lane'),
      })
      if (!dailyLaneResolved.ok) {
        throw new Error(dailyLaneResolved.message)
      }
      const ingestionOrchestrationResult = await runIngestionOrchestration(
        withOpId,
        'daily',
        orchestrationTelemetry,
        dailyLaneResolved.context
      )
      results.tasks.ingestionOrchestration = ingestionOrchestrationResult
    } catch (error) {
      logger.error('Ingestion orchestration task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
      }))
      results.tasks.ingestionOrchestration = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }


    // Determine overall success (at least one task must succeed)
    const hasSuccess = Object.values(results.tasks).some((task: any) => task.ok === true)
    if (!hasSuccess) {
      results.ok = false
    }

    logger.info('Daily cron job completed', withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
      results,
    }))

    const durationMs = Date.now() - startedAt
    results.health = deriveCronHealthFromIngestionTask(results.tasks.ingestionOrchestration, durationMs, env)
    results.duration_ms = durationMs
    results.deployment_environment = deploymentEnv
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.api.cronDailyHit, {
        requestId: correlation.requestId,
        operationId: correlation.operationId,
        correlationId: correlation.correlationId,
        jobType: jobTypeLabel,
        phase: 'response',
        mode,
        httpStatus: results.ok ? 200 : 500,
        resultsOk: results.ok,
        durationMs,
      })
    )
    return NextResponse.json(results, { status: results.ok ? 200 : 500 })
  } catch (error) {
    // Handle auth errors (thrown by assertCronAuthorized)
    if (error instanceof NextResponse) {
      return error
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in daily cron', error instanceof Error ? error : new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
    }))

    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.api.cronDailyHit, {
        requestId: correlation.requestId,
        operationId: correlation.operationId,
        correlationId: correlation.correlationId,
        jobType: 'cron.daily',
        phase: 'unhandled_error',
        httpStatus: 500,
        durationMs: Date.now() - startedAt,
      })
    )

    return NextResponse.json(
      {
        ok: false,
        job: 'daily',
        runAt,
        env,
        deployment_environment: deploymentEnv,
        duration_ms: Date.now() - startedAt,
        health: deriveCronHealthFromIngestionTask(null, Date.now() - startedAt, env),
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

async function runIngestionOrchestration(
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

  // Step 1: External page source — config-driven list URLs per enabled city row; geocode/publish follow in later steps.
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
          logger.warn('External page source: skipping config — crawlable filter bypass (invalid URLs at processing time)', {
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
        totals.ystmDetailFirstAttempted += s.ystmDetailFirstAttempted ?? 0
        totals.ystmDetailFirstSucceeded += s.ystmDetailFirstSucceeded ?? 0
        totals.ystmDetailFirstPublished += s.ystmDetailFirstPublished ?? 0
        totals.ystmDetailFirstFallback += s.ystmDetailFirstFallback ?? 0
        totals.ystmDetailFirstFetchFailed += s.ystmDetailFirstFetchFailed ?? 0
        totals.ystmDetailFirstMsSamples.push(...(s.ystmDetailFirstMsToPublishedSamples ?? []))

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
          },
        })
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
            rejectedByReason: {},
            msToPublishedSamples: totals.ystmDetailFirstMsSamples,
          },
          totals.freshInserted
        ),
        dedupeTelemetrySummary: ingestionDedupeTelemetrySummary,
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
            rejectedByReason: {},
            msToPublishedSamples: totals.ystmDetailFirstMsSamples,
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

  // Step 2b: Image enrichment (D2.5) — detail mediaStr for rows missing images.
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

async function expireEndedPromotions(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting expire promotions task', withOpId({
    component: 'api/cron/daily',
    task: 'expire-promotions',
  }))

  const db = getAdminDb()
  const now = new Date().toISOString()

  // Find promotions that should be expired:
  // - status is 'active'
  // - ends_at < now
  const { data: expiredPromotions, error: queryError } = await fromBase(db, 'promotions')
    .select('id, sale_id, ends_at')
    .eq('status', 'active')
    .lt('ends_at', now)

  if (queryError) {
    const errorMessage = queryError && typeof queryError === 'object' && 'message' in queryError
      ? String(queryError.message)
      : String(queryError)
    logger.error('Failed to query promotions for expiry', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      error: queryError,
    }))
    throw new Error('Failed to query promotions')
  }

  if (!expiredPromotions || expiredPromotions.length === 0) {
    logger.info('No promotions to expire', withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      count: 0,
    }))
    return {
      ok: true,
      expiredCount: 0,
    }
  }

  // Update all expired promotions to 'expired' status
  const promotionIds = expiredPromotions.map((p) => p.id)
  const { error: updateError } = await fromBase(db, 'promotions')
    .update({
      status: 'expired',
      updated_at: now,
    })
    .in('id', promotionIds)
    .eq('status', 'active') // Only update if still active (idempotent)

  if (updateError) {
    const errorMessage = updateError && typeof updateError === 'object' && 'message' in updateError
      ? String(updateError.message)
      : String(updateError)
    logger.error('Failed to expire promotions', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      error: updateError,
      count: promotionIds.length,
    }))
    throw new Error('Failed to expire promotions')
  }

  logger.info('Promotions expired successfully', withOpId({
    component: 'api/cron/daily',
    task: 'expire-promotions',
    expiredCount: expiredPromotions.length,
    promotionIds: expiredPromotions.map((p) => p.id),
  }))

  return {
    ok: true,
    expiredCount: expiredPromotions.length,
  }
}

async function sendWeeklyModerationDigest(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting weekly moderation digest task', withOpId({
    component: 'api/cron/daily',
    task: 'moderation-digest',
  }))

  // Calculate 7-day window (last week to now in UTC)
  const now = new Date()
  const lastWeek = new Date(now)
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7)

  const adminDb = getAdminDb()

  // Query for new reports in the last 7 days
  const { data: reports, error: reportsError } = await fromBase(adminDb, 'sale_reports')
    .select(`
      id,
      sale_id,
      reporter_profile_id,
      reason,
      created_at,
      sales:sale_id (
        id,
        title,
        address,
        city,
        state
      )
    `)
    .gte('created_at', lastWeek.toISOString())
    .order('created_at', { ascending: false })

  if (reportsError) {
    logger.error('Failed to fetch reports for digest', reportsError instanceof Error ? reportsError : new Error(String(reportsError)), withOpId({
      component: 'api/cron/daily',
      task: 'moderation-digest',
      operation: 'fetch_reports',
    }))
    throw new Error('Failed to fetch reports')
  }

  // Transform reports for email template
  const reportItems: ReportDigestItem[] = (reports || []).map((report: any) => {
    const sale = report.sales || {}
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
    
    return {
      reportId: report.id,
      saleId: report.sale_id,
      saleTitle: sale.title || 'Untitled Sale',
      saleAddress: sale.address ? `${sale.address}, ${sale.city || ''}, ${sale.state || ''}`.trim() : 'Address not available',
      reason: report.reason,
      createdAt: report.created_at,
      reporterId: report.reporter_profile_id,
      adminViewUrl: `${baseUrl}/admin/tools/reports?reportId=${report.id}`,
    }
  })

  // Format date window for email (last 7 days)
  const dateWindow = lastWeek.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }) + ' - ' + now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Send email
  const emailResult = await sendModerationDailyDigestEmail({
    reports: reportItems,
    dateWindow,
  })

  if (!emailResult.ok) {
    logger.error('Failed to send moderation digest email', new Error(emailResult.error || 'Unknown error'), withOpId({
      component: 'api/cron/daily',
      task: 'moderation-digest',
      operation: 'send_email',
      reportCount: reportItems.length,
    }))
    throw new Error('Failed to send email')
  }

  logger.info('Weekly moderation digest sent successfully', withOpId({
    component: 'api/cron/daily',
    task: 'moderation-digest',
    operation: 'send_email',
    reportCount: reportItems.length,
  }))

  return {
    ok: true,
    reportCount: reportItems.length,
  }
}

