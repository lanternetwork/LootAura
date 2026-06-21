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
import { assertCronAuthorized } from '@/lib/auth/cron'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
import { sendModerationDailyDigestEmail } from '@/lib/email/moderationDigest'
import { logger, generateOperationId } from '@/lib/log'
import { createCorrelationBundle } from '@/lib/observability/correlation'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { runIngestionOrchestration } from '@/lib/ingestion/dailyIngestionOrchestration'
import { resolveIngestionLaneContext } from '@/lib/ingestion/resolveIngestionLaneContext'
import { runArchiveEndedSalesJob } from '@/lib/sales/archiveEndedSalesSqlBatch'
import type { ReportDigestItem } from '@/lib/email/templates/ModerationDailyDigestEmail'

export const dynamic = 'force-dynamic'

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

