/**
 * GET /api/cron/daily
 * POST /api/cron/daily
 * 
 * Unified daily cron endpoint that handles multiple daily tasks:
 * 1. Auto-archive sales that have ended
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
 * `geocodePendingSales({ batchSizeOverride })` using `GEOCODE_BACKLOG_BATCH_SIZE` (default 25, cap 100).
 * Does not pass `captureClaimedRowIds` (cron geocode route owns that for observability).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
import { sendModerationDailyDigestEmail } from '@/lib/email/moderationDigest'
import { logger, generateOperationId } from '@/lib/log'
import { geocodePendingSales, type GeocodeWorkerSummary } from '@/lib/ingestion/geocodeWorker'
import { publishReadyIngestedSales, type PublishWorkerBatchSummary } from '@/lib/ingestion/publishWorker'
import {
  fetchLastSuccessfulExternalIngestionAt,
  recordIngestionOrchestrationRun,
  type ExternalIngestionOrchestrationNote,
} from '@/lib/ingestion/orchestrationMetrics'
import {
  normalizeSourcePages,
  persistExternalPageSource,
} from '@/lib/ingestion/adapters/externalPageSource'
import type { ReportDigestItem } from '@/lib/email/templates/ModerationDailyDigestEmail'

export const dynamic = 'force-dynamic'
const DEFAULT_BACKLOG_BATCH = 25
const MAX_BACKLOG_BATCH = 100

/** Minimum minutes between external_page_source ingestion runs when `mode=ingestion` (geocode/publish always run). */
function parseIngestionOrchestrationMinMinutes(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_MIN_MINUTES
  const defaultMinutes = 10
  if (raw === undefined || raw === '') {
    return defaultMinutes
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultMinutes
  }
  return Math.min(parsed, 24 * 60)
}

function parseBacklogBatchLimit(): number {
  const raw = process.env.GEOCODE_BACKLOG_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_BACKLOG_BATCH
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BACKLOG_BATCH
  }
  return Math.min(parsed, MAX_BACKLOG_BATCH)
}

function parseExternalFetchDomainMinSpacingMs(): number {
  const raw = process.env.EXTERNAL_FETCH_DOMAIN_MIN_SPACING_MS
  const defaultMs = 500
  if (raw === undefined || raw === '') return defaultMs
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMs
  return Math.min(parsed, 60_000)
}

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

type ExternalConfigRow = {
  city: string
  state: string
  source_platform: string
  source_pages: unknown
}

type IngestionOrchestrationLease = {
  acquired: boolean
  owner: string
  staleRecovered: boolean
  cursor: number
  reason?: 'active_lease' | 'acquire_failed'
}

type IngestionOrchestrationStateRow = {
  cursor: number | null
  lease_owner: string | null
  lease_expires_at: string | null
}

function pickPrimaryDomainFromSourcePages(rawPages: unknown): string | null {
  const pages = normalizeSourcePages(rawPages)
  for (const page of pages) {
    try {
      return new URL(page).hostname.toLowerCase()
    } catch {
      continue
    }
  }
  return null
}

function interleaveConfigsByDomain(rows: ExternalConfigRow[]): ExternalConfigRow[] {
  const byDomain = new Map<string, ExternalConfigRow[]>()
  const domainOrder: string[] = []
  for (const row of rows) {
    const domain = pickPrimaryDomainFromSourcePages(row.source_pages) ?? '__unknown__'
    if (!byDomain.has(domain)) {
      byDomain.set(domain, [])
      domainOrder.push(domain)
    }
    byDomain.get(domain)!.push(row)
  }

  const out: ExternalConfigRow[] = []
  while (true) {
    let added = false
    for (const domain of domainOrder) {
      const q = byDomain.get(domain)
      if (!q || q.length === 0) continue
      const next = q.shift()
      if (next) {
        out.push(next)
        added = true
      }
    }
    if (!added) break
  }
  return out
}

function sortExternalConfigsDeterministic(rows: ExternalConfigRow[]): ExternalConfigRow[] {
  return [...rows].sort((a, b) => {
    const aCity = `${a.state || ''}|${a.city || ''}`.toLowerCase()
    const bCity = `${b.state || ''}|${b.city || ''}`.toLowerCase()
    if (aCity !== bCity) {
      return aCity.localeCompare(bCity)
    }
    const aPages = normalizeSourcePages(a.source_pages).join('|')
    const bPages = normalizeSourcePages(b.source_pages).join('|')
    return aPages.localeCompare(bPages)
  })
}

function parseIngestionOrchestrationConfigBatchSize(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE
  const defaultSize = 20
  if (raw === undefined || raw === '') return defaultSize
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultSize
  return Math.min(parsed, 500)
}

function parseIngestionOrchestrationExecutionBudgetMs(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_EXECUTION_BUDGET_MS
  const defaultBudgetMs = 45_000
  if (raw === undefined || raw === '') return defaultBudgetMs
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return defaultBudgetMs
  // 0 = no wall time budget for bounded config work (exit before first row; tests / emergency brake)
  if (parsed === 0) return 0
  return Math.min(parsed, 240_000)
}

function parseIngestionOrchestrationLeaseSeconds(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_LEASE_SECONDS
  const defaultSeconds = 120
  if (raw === undefined || raw === '') return defaultSeconds
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 30) return defaultSeconds
  return Math.min(parsed, 600)
}

async function ensureIngestionOrchestrationStateRow(withOpId: (context?: any) => any): Promise<void> {
  const adminDb = getAdminDb()
  const { error } = await fromBase(adminDb, 'ingestion_orchestration_state').upsert(
    { key: 'external_page_source', cursor: 0 },
    { onConflict: 'key', ignoreDuplicates: true }
  )
  if (error) {
    logger.error('Failed to ensure ingestion orchestration state row', new Error(error.message), withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'ingestion',
      operation: 'ensure_orchestration_state',
    }))
    throw new Error('Failed to ensure ingestion orchestration state')
  }
}

async function acquireIngestionOrchestrationLease(
  withOpId: (context?: any) => any
): Promise<IngestionOrchestrationLease> {
  await ensureIngestionOrchestrationStateRow(withOpId)
  const adminDb = getAdminDb()
  const owner = generateOperationId()
  const nowMs = Date.now()
  const leaseSeconds = parseIngestionOrchestrationLeaseSeconds()
  const leaseExpiresAtIso = new Date(nowMs + leaseSeconds * 1000).toISOString()

  const { data: stateRows, error: selectError } = await fromBase(adminDb, 'ingestion_orchestration_state')
    .select('cursor, lease_owner, lease_expires_at')
    .eq('key', 'external_page_source')
    .limit(1)
  if (selectError || !Array.isArray(stateRows) || stateRows.length === 0) {
    logger.error('Failed to load ingestion orchestration state', new Error(selectError?.message || 'row missing'), withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'ingestion',
      operation: 'lease_acquire',
    }))
    return { acquired: false, owner, staleRecovered: false, cursor: 0, reason: 'acquire_failed' }
  }

  const current = stateRows[0] as IngestionOrchestrationStateRow
  const ownerNow = current.lease_owner ?? null
  const expiresNow = current.lease_expires_at ?? null
  const currentExpiresMs =
    typeof expiresNow === 'string' && expiresNow.length > 0
      ? Date.parse(expiresNow)
      : Number.NaN
  const leaseActive =
    !!ownerNow &&
    Number.isFinite(currentExpiresMs) &&
    currentExpiresMs > nowMs

  if (leaseActive) {
    logger.info('Ingestion orchestration lease already active; skipping overlapping run', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'ingestion',
      operation: 'lease_acquire',
      overlapPrevented: true,
    }))
    return {
      acquired: false,
      owner,
      staleRecovered: false,
      cursor: current.cursor ?? 0,
      reason: 'active_lease',
    }
  }

  const staleRecovered = !!ownerNow && Number.isFinite(currentExpiresMs) && currentExpiresMs <= nowMs
  const leaseUpdatePayload = {
    lease_owner: owner,
    lease_expires_at: leaseExpiresAtIso,
    last_started_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
  }
  let leaseUpdateQuery = fromBase(adminDb, 'ingestion_orchestration_state')
    .update(leaseUpdatePayload)
    .eq('key', 'external_page_source')

  leaseUpdateQuery =
    ownerNow === null
      ? leaseUpdateQuery.is('lease_owner', null)
      : leaseUpdateQuery.eq('lease_owner', ownerNow)
  leaseUpdateQuery =
    expiresNow === null
      ? leaseUpdateQuery.is('lease_expires_at', null)
      : leaseUpdateQuery.eq('lease_expires_at', expiresNow)

  const { data: updatedRows, error: updateError } = await leaseUpdateQuery.select('cursor')

  if (updateError || !Array.isArray(updatedRows) || updatedRows.length === 0) {
    logger.warn('Ingestion orchestration lease acquire lost race; skipping run', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'ingestion',
      operation: 'lease_acquire',
      overlapPrevented: true,
      message: updateError?.message,
    }))
    return { acquired: false, owner, staleRecovered: false, cursor: current.cursor ?? 0, reason: 'active_lease' }
  }

  logger.info('Ingestion orchestration lease acquired', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    step: 'ingestion',
    operation: 'lease_acquire',
    staleRecovered,
  }))
  return { acquired: true, owner, staleRecovered, cursor: (updatedRows[0]?.cursor as number | null) ?? (current.cursor ?? 0) }
}

async function releaseIngestionOrchestrationLease(
  withOpId: (context?: any) => any,
  params: {
    owner: string
    nextCursor: number
    markCompleted: boolean
  }
): Promise<void> {
  const adminDb = getAdminDb()
  const payload: Record<string, unknown> = {
    cursor: params.nextCursor,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  }
  if (params.markCompleted) {
    payload.last_completed_at = new Date().toISOString()
  }
  const { data, error } = await fromBase(adminDb, 'ingestion_orchestration_state')
    .update(payload)
    .eq('key', 'external_page_source')
    .eq('lease_owner', params.owner)
    .select('key')
  if (error || !Array.isArray(data) || data.length === 0) {
    logger.warn('Failed to release ingestion orchestration lease cleanly', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'ingestion',
      operation: 'lease_release',
      message: error?.message,
    }))
  }
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
  const withOpId = (context: any = {}) => ({ ...context, requestId: opId })

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
        return error
      }
      // If it's not a NextResponse, rethrow
      throw error
    }

    const cronModeParam = request.nextUrl.searchParams.get('mode')
    const isIngestionOnly = cronModeParam === 'ingestion'
    const mode = isIngestionOnly ? 'ingestion' : 'daily'

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
      try {
        const ingestionOrchestrationResult = await runIngestionOrchestration(withOpId, 'ingestion')
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
      return NextResponse.json(results, { status: results.ok ? 200 : 500 })
    }

    // Task 1: Auto-archive sales that have ended
    try {
      const archiveResult = await archiveEndedSales(withOpId)
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
      const ingestionOrchestrationResult = await runIngestionOrchestration(withOpId, 'daily')
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
  mode: 'daily' | 'ingestion'
): Promise<any> {
  const orchestrationStartedAt = Date.now()
  logger.info('Starting ingestion orchestration task', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    mode,
  }))

  const taskResult: any = {
    ok: true,
    steps: {},
  }

  let geocodeSummary: GeocodeWorkerSummary | null = null
  let publishSummary: PublishWorkerBatchSummary | null = null
  let externalIngestionNote: ExternalIngestionOrchestrationNote | null = null

  const minIngestionMinutes = mode === 'ingestion' ? parseIngestionOrchestrationMinMinutes() : 0
  let skipExternalIngestion = false

  if (mode === 'ingestion' && minIngestionMinutes > 0) {
    const lastCompletedAt = await fetchLastSuccessfulExternalIngestionAt()
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
        }
        externalIngestionNote = {
          status: 'skipped_throttle',
          reason: 'ingestion_interval',
          minIntervalMinutes: minIngestionMinutes,
          lastSuccessfulExternalIngestionAt: lastCompletedAt,
        }
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
    try {
      logger.info('Ingestion step started', withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'ingestion',
      }))

      acquiredLease = await acquireIngestionOrchestrationLease(withOpId)
      if (!acquiredLease.acquired) {
        taskResult.steps.ingestion = {
          ok: true,
          skipped: true,
          reason: 'active_orchestration_lock',
        }
        externalIngestionNote = {
          status: 'skipped_lock_active',
          overlapPrevented: true,
          lockSkipped: true,
        }
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
      const { data: enabledCities, error: cityError } = await fromBase(adminDb, 'ingestion_city_configs')
        .select('city, state, source_platform, source_pages')
        .eq('enabled', true)

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
      }

      const rows = sortExternalConfigsDeterministic(
        ((enabledCities || []) as ExternalConfigRow[]).filter(
          (row) => row.source_platform === 'external_page_source'
        )
      )
      const plannedRows = interleaveConfigsByDomain(rows)
      const totalConfigs = plannedRows.length
      const batchSize = parseIngestionOrchestrationConfigBatchSize()
      const executionBudgetMs = parseIngestionOrchestrationExecutionBudgetMs()
      const budgetStartedAtMs = Date.now()
      const baseCursor =
        totalConfigs > 0 && acquiredLease
          ? ((acquiredLease.cursor % totalConfigs) + totalConfigs) % totalConfigs
          : 0
      const cappedCount = Math.min(batchSize, totalConfigs)
      const boundedRows =
        totalConfigs === 0
          ? []
          : Array.from({ length: cappedCount }, (_, offset) => plannedRows[(baseCursor + offset) % totalConfigs])
      let budgetExited = false
      let configsConsumed = 0
      let configsSkippedInvalidPages = 0
      const domainMinSpacingMs = parseExternalFetchDomainMinSpacingMs()
      const jitterRangeMs = parseExternalFetchJitterRangeMs()
      const jitterSeedString = `ingestion:${mode}:${new Date().toISOString()}`
      const jitterSeed = hashStringToUint32(jitterSeedString)
      const nextRandom = makeSeededPrng(jitterSeed)
      const lastRequestAtByDomain = new Map<string, number>()
      const requestsByDomain = new Map<string, number>()

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
          logger.warn('External page source: skipping config — no valid source_pages URLs', {
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
      }

      const completedAt = new Date().toISOString()
      externalIngestionNote = {
        status: 'completed',
        completedAt,
        configsProcessed: totals.configsProcessed,
        configsConsumed,
        configsSkippedInvalidPages,
        configsRemaining,
        budgetExit: budgetExited,
        overlapPrevented: false,
        staleLockRecovered: acquiredLease?.staleRecovered ?? false,
      }

      logger.info('Ingestion step completed', withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'ingestion',
        adapter: 'external_page_source',
        configsProcessed: totals.configsProcessed,
        configsConsumed,
        configsSkippedInvalidPages,
        pagesProcessed: totals.pagesProcessed,
        fetched: totals.fetched,
        inserted: totals.inserted,
        skipped: totals.skipped,
        invalid: totals.invalid,
        errors: totals.errors,
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
      }
      externalIngestionNote = { status: 'failed' }
      logger.error('Ingestion step failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
        step: 'ingestion',
      }))
      }
    } finally {
      if (lockHeld && acquiredLease) {
        await releaseIngestionOrchestrationLease(withOpId, {
          owner: acquiredLease.owner,
          nextCursor,
          markCompleted,
        })
      }
    }
  }

  const geoPublishStartMs = Date.now()

  // Step 2: Geocode pending sales.
  try {
    const backlogBatchSize = parseBacklogBatchLimit()
    logger.info('Geocode step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'geocode',
      backlogBatchSize,
    }))
    geocodeSummary = await geocodePendingSales({ batchSizeOverride: backlogBatchSize })
    taskResult.steps.geocode = {
      ok: true,
      backlogBatchSize,
      ...geocodeSummary,
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

  // Step 3: Publish ready ingested sales.
  try {
    logger.info('Publish step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
    }))
    publishSummary = await publishReadyIngestedSales()
    taskResult.steps.publish = {
      ok: true,
      ...publishSummary,
    }
    logger.info('Publish step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
      ...publishSummary,
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
  await recordIngestionOrchestrationRun({
    mode,
    orchestrationGeoPublishDurationMs,
    geocodeSummary,
    publishSummary,
    externalIngestion: externalIngestionNote,
  })

  logger.info('Ingestion orchestration task completed', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    durationMs: Date.now() - orchestrationStartedAt,
    result: taskResult,
  }))

  taskResult.duration_ms = Date.now() - orchestrationStartedAt
  return taskResult
}

async function archiveEndedSales(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting archive sales task', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
  }))

  // Get admin DB client (bypasses RLS)
  const db = getAdminDb()
  const now = new Date()
  // Use UTC date to avoid timezone issues
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD format

  // Find sales that should be archived:
  // - status is 'published' or 'active'
  // - (end_date <= today OR (end_date IS NULL AND date_start < today))
  // - archived_at IS NULL (not already archived)
  // Note: We need to fetch all published/active sales and filter in memory
  // because PostgREST doesn't easily support complex OR conditions
  const { data: allSales, error: queryError } = await fromBase(db, 'sales')
    .select('id, title, date_start, date_end, status, archived_at')
    .in('status', ['published', 'active'])
    .is('archived_at', null)

  if (queryError) {
    const errorMessage = queryError && typeof queryError === 'object' && 'message' in queryError
      ? String(queryError.message)
      : String(queryError)
    logger.error('Failed to query sales for archiving', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'archive-sales',
      error: queryError,
    }))
    throw new Error('Failed to query sales')
  }

  // Filter sales that have ended:
  // - Sales with date_end <= today (ended today or before)
  // - Sales without date_end but with date_start < today (single-day sales that started in the past)
  const salesToArchive = (allSales || []).filter((sale: any) => {
    if (sale.date_end) {
      // Parse date_end and compare properly
      const endDate = new Date(sale.date_end + 'T00:00:00Z')
      // Archive if end date is today or in the past
      return endDate <= today
    }
    // If no end_date, check if start_date is in the past (single-day sale)
    if (sale.date_start) {
      // Parse date_start and compare properly
      const startDate = new Date(sale.date_start + 'T00:00:00Z')
      // Archive if start date is before today (sale already happened)
      return startDate < today
    }
    // If no dates at all, don't archive (shouldn't happen for published sales)
    return false
  })

  // Log details about what we found for debugging
  logger.info('Archive sales filtering details', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    today: todayStr,
    totalSales: allSales?.length || 0,
    salesToArchiveCount: salesToArchive.length,
    sampleSalesToArchive: salesToArchive.slice(0, 5).map((s: any) => ({
      id: s.id,
      title: s.title?.substring(0, 50),
      date_start: s.date_start,
      date_end: s.date_end,
      status: s.status,
    })),
    // Also log some sales that weren't archived (for debugging)
    sampleSalesNotArchived: (allSales || [])
      .filter((s: any) => !salesToArchive.some((a: any) => a.id === s.id))
      .slice(0, 5)
      .map((s: any) => ({
        id: s.id,
        title: s.title?.substring(0, 50),
        date_start: s.date_start,
        date_end: s.date_end,
        status: s.status,
        reason: s.date_end 
          ? `date_end (${s.date_end}) > today (${todayStr})`
          : s.date_start
          ? `date_start (${s.date_start}) >= today (${todayStr})`
          : 'no dates',
      })),
  }))

  const salesToArchiveCount = salesToArchive?.length || 0

  if (salesToArchiveCount === 0) {
    logger.info('No sales to archive', withOpId({
      component: 'api/cron/daily',
      task: 'archive-sales',
      count: 0,
    }))
    return {
      ok: true,
      archived: 0,
      errors: 0,
    }
  }

  logger.info(`Found ${salesToArchiveCount} sales to archive`, withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    count: salesToArchiveCount,
  }))

  // Archive all matching sales by ID
  const saleIdsToArchive = salesToArchive.map((s: any) => s.id)
  if (saleIdsToArchive.length === 0) {
    return {
      ok: true,
      archived: 0,
      errors: 0,
    }
  }

  const { data: archivedSales, error: updateError } = await fromBase(db, 'sales')
    .update({
      status: 'archived',
      archived_at: now.toISOString(),
    })
    .in('id', saleIdsToArchive)
    .select('id')

  if (updateError) {
    logger.error('Failed to archive sales', updateError instanceof Error ? updateError : new Error(String(updateError)), withOpId({
      component: 'api/cron/daily',
      task: 'archive-sales',
      error: updateError,
    }))
    throw new Error('Failed to archive sales')
  }

  const archivedCount = archivedSales?.length || 0

  logger.info('Archive sales task completed', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    archivedCount,
  }))

  return {
    ok: true,
    archived: archivedCount,
    errors: 0,
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

