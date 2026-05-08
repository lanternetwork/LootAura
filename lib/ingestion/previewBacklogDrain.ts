import { geocodePendingSales } from '@/lib/ingestion/geocodeWorker'
import { logger } from '@/lib/log'
import type { NextResponse } from 'next/server'

const DEFAULT_BATCH_SIZE = 25
const MAX_BATCH_SIZE = 100
const DEFAULT_COOLDOWN_MINUTES = 3
const MIN_COOLDOWN_MINUTES = 2
const MAX_COOLDOWN_MINUTES = 5
const DEFAULT_LEASE_TTL_SECONDS = 120
const LOCK_KEY = 'ingestion:preview_backlog_drain:lock'
const COMPONENT = 'ingestion/previewBacklogDrain'

export const PREVIEW_BACKLOG_DRAIN_HEADER = 'x-lootaura-preview-backlog-drain'
export const PREVIEW_BACKLOG_HEADER_REASON = 'x-lootaura-preview-backlog-reason'
export const PREVIEW_BACKLOG_HEADER_CLAIMED = 'x-lootaura-preview-backlog-claimed'
export const PREVIEW_BACKLOG_HEADER_PROCESSED = 'x-lootaura-preview-backlog-processed'
export const PREVIEW_BACKLOG_HEADER_FAILED = 'x-lootaura-preview-backlog-failed'
export const PREVIEW_BACKLOG_HEADER_GEOCODE_INVOKED = 'x-lootaura-preview-backlog-geocode-invoked'
export const PREVIEW_BACKLOG_HEADER_GEOCODE_RESOLVED = 'x-lootaura-preview-backlog-geocode-resolved'
export const PREVIEW_BACKLOG_HEADER_COOLDOWN_MUTATED = 'x-lootaura-preview-backlog-cooldown-mutated'
export const PREVIEW_BACKLOG_HEADER_MS_SINCE_LAST_RUN = 'x-lootaura-preview-backlog-ms-since-last-run'
export const PREVIEW_BACKLOG_HEADER_FIRST_CLAIMED_IDS = 'x-lootaura-preview-backlog-first-claimed-ids'
export const PREVIEW_BACKLOG_HEADER_DURATION_MS = 'x-lootaura-preview-backlog-duration-ms'

/** All preview-only backlog observability headers (for tests). */
export const PREVIEW_BACKLOG_DRAIN_HEADER_NAMES = [
  PREVIEW_BACKLOG_DRAIN_HEADER,
  PREVIEW_BACKLOG_HEADER_REASON,
  PREVIEW_BACKLOG_HEADER_CLAIMED,
  PREVIEW_BACKLOG_HEADER_PROCESSED,
  PREVIEW_BACKLOG_HEADER_FAILED,
  PREVIEW_BACKLOG_HEADER_GEOCODE_INVOKED,
  PREVIEW_BACKLOG_HEADER_GEOCODE_RESOLVED,
  PREVIEW_BACKLOG_HEADER_COOLDOWN_MUTATED,
  PREVIEW_BACKLOG_HEADER_MS_SINCE_LAST_RUN,
  PREVIEW_BACKLOG_HEADER_FIRST_CLAIMED_IDS,
  PREVIEW_BACKLOG_HEADER_DURATION_MS,
] as const

type DrainState = {
  inFlight: boolean
  lastCompletedAtMs: number
}

export type PreviewBacklogDrainStatus =
  | 'started'
  | 'completed'
  | 'cooldown_skip'
  | 'inflight_skip'
  | 'lease_busy'
  | 'lease_unavailable'
  | 'gate_skip'
  | 'error'

export type PreviewBacklogDrainResult = {
  status: PreviewBacklogDrainStatus
  reason: string
  claimed: number
  processed: number
  failed: number
  publishTriggered: number
  publishOk: number
  publishFailed: number
  geocodeInvoked: boolean
  geocodeResolvedSuccessfully: boolean
  cooldownTimestampMutated: boolean
  msSinceLastRun: number | null
  durationMs: number
  firstClaimedRowIds: string[]
}

function isPreviewResponseHeadersRuntime(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'preview'
}

/** Sets compact preview-only headers; no-op outside preview production. */
export function applyPreviewBacklogDrainHeaders(
  response: NextResponse,
  result: PreviewBacklogDrainResult
): NextResponse {
  if (!isPreviewResponseHeadersRuntime()) {
    return response
  }
  const ids = result.firstClaimedRowIds.slice(0, 5).join(',')
  response.headers.set(PREVIEW_BACKLOG_DRAIN_HEADER, result.status)
  response.headers.set(PREVIEW_BACKLOG_HEADER_REASON, result.reason)
  response.headers.set(PREVIEW_BACKLOG_HEADER_CLAIMED, String(result.claimed))
  response.headers.set(PREVIEW_BACKLOG_HEADER_PROCESSED, String(result.processed))
  response.headers.set(PREVIEW_BACKLOG_HEADER_FAILED, String(result.failed))
  response.headers.set(PREVIEW_BACKLOG_HEADER_GEOCODE_INVOKED, result.geocodeInvoked ? 'true' : 'false')
  response.headers.set(
    PREVIEW_BACKLOG_HEADER_GEOCODE_RESOLVED,
    result.geocodeResolvedSuccessfully ? 'true' : 'false'
  )
  response.headers.set(
    PREVIEW_BACKLOG_HEADER_COOLDOWN_MUTATED,
    result.cooldownTimestampMutated ? 'true' : 'false'
  )
  response.headers.set(
    PREVIEW_BACKLOG_HEADER_MS_SINCE_LAST_RUN,
    result.msSinceLastRun == null ? '' : String(result.msSinceLastRun)
  )
  response.headers.set(PREVIEW_BACKLOG_HEADER_FIRST_CLAIMED_IDS, ids)
  response.headers.set(PREVIEW_BACKLOG_HEADER_DURATION_MS, String(result.durationMs))
  return response
}

function baseResult(
  partial: Partial<PreviewBacklogDrainResult> & Pick<PreviewBacklogDrainResult, 'status' | 'reason'>
): PreviewBacklogDrainResult {
  return {
    status: partial.status,
    reason: partial.reason,
    claimed: partial.claimed ?? 0,
    processed: partial.processed ?? 0,
    failed: partial.failed ?? 0,
    publishTriggered: partial.publishTriggered ?? 0,
    publishOk: partial.publishOk ?? 0,
    publishFailed: partial.publishFailed ?? 0,
    geocodeInvoked: partial.geocodeInvoked ?? false,
    geocodeResolvedSuccessfully: partial.geocodeResolvedSuccessfully ?? false,
    cooldownTimestampMutated: partial.cooldownTimestampMutated ?? false,
    msSinceLastRun: partial.msSinceLastRun ?? null,
    durationMs: partial.durationMs ?? 0,
    firstClaimedRowIds: partial.firstClaimedRowIds ?? [],
  }
}

function getState(): DrainState {
  const root = globalThis as typeof globalThis & {
    __previewBacklogDrainState?: DrainState
  }
  if (!root.__previewBacklogDrainState) {
    root.__previewBacklogDrainState = {
      inFlight: false,
      lastCompletedAtMs: 0,
    }
  }
  return root.__previewBacklogDrainState
}

function isPreviewRuntime(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'preview'
}

function parseBatchSize(): number {
  const raw = process.env.GEOCODE_BACKLOG_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_BATCH_SIZE
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BATCH_SIZE
  }
  return Math.min(parsed, MAX_BATCH_SIZE)
}

function parseCooldownMinutes(): number {
  const raw = process.env.PREVIEW_GEOCODE_BACKLOG_COOLDOWN_MINUTES
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_COOLDOWN_MINUTES
  if (!Number.isFinite(parsed)) {
    return DEFAULT_COOLDOWN_MINUTES
  }
  return Math.min(Math.max(parsed, MIN_COOLDOWN_MINUTES), MAX_COOLDOWN_MINUTES)
}

function parseLeaseTtlSeconds(): number {
  const raw = process.env.PREVIEW_GEOCODE_BACKLOG_LEASE_TTL_SECONDS
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_LEASE_TTL_SECONDS
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LEASE_TTL_SECONDS
  }
  return Math.min(Math.max(parsed, 30), 600)
}

async function acquireRedisLease(ttlSeconds: number): Promise<boolean> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!redisUrl || !redisToken) return false

  const response = await fetch(`${redisUrl}/set/${LOCK_KEY}/1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nx: true, ex: ttlSeconds }),
  })

  if (!response.ok) {
    throw new Error(`Lease request failed: ${response.status}`)
  }

  const payload = (await response.json()) as { result?: string | null }
  return payload.result === 'OK'
}

export async function maybeRunPreviewBacklogDrain(trigger: string): Promise<PreviewBacklogDrainResult> {
  const NODE_ENV = process.env.NODE_ENV || 'development'
  const VERCEL_ENV = process.env.VERCEL_ENV || 'unknown'
  const hasRedisEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  const source = trigger
  if (!isPreviewRuntime()) {
    logger.info('Preview backlog drain skipped by runtime gate', {
      component: COMPONENT,
      operation: 'gate_skip',
      reason: 'not_preview_runtime',
      source,
      NODE_ENV,
      VERCEL_ENV,
      hasRedisEnv,
      cooldownMs: parseCooldownMinutes() * 60 * 1000,
      msSinceLastRun: null,
      batchSize: parseBatchSize(),
      durationMs: 0,
    })
    return baseResult({
      status: 'gate_skip',
      reason: 'not_preview_runtime',
      msSinceLastRun: null,
    })
  }

  const state = getState()
  const nowMs = Date.now()
  const cooldownMs = parseCooldownMinutes() * 60 * 1000
  const msSinceLastRun = state.lastCompletedAtMs > 0 ? nowMs - state.lastCompletedAtMs : null
  const batchSize = parseBatchSize()
  if (state.inFlight) {
    logger.info('Preview backlog drain skipped because a run is already in flight', {
      component: COMPONENT,
      operation: 'inflight_skip',
      reason: 'in_flight',
      source,
      NODE_ENV,
      VERCEL_ENV,
      hasRedisEnv,
      cooldownMs,
      msSinceLastRun,
      batchSize,
      durationMs: 0,
    })
    return baseResult({
      status: 'inflight_skip',
      reason: 'in_flight',
      msSinceLastRun,
    })
  }
  if (state.lastCompletedAtMs > 0 && nowMs - state.lastCompletedAtMs < cooldownMs) {
    logger.info('Preview backlog drain skipped due to cooldown', {
      component: COMPONENT,
      operation: 'cooldown_skip',
      reason: 'cooldown_active',
      source,
      NODE_ENV,
      VERCEL_ENV,
      hasRedisEnv,
      cooldownMs,
      msSinceLastRun,
      batchSize,
      durationMs: 0,
    })
    return baseResult({
      status: 'cooldown_skip',
      reason: 'cooldown_active',
      msSinceLastRun,
      cooldownTimestampMutated: false,
    })
  }

  state.inFlight = true
  const previousLastCompletedAtMs = state.lastCompletedAtMs
  let completedGeocodeWork = false
  let geocodeInvoked = false
  let geocodeResolvedSuccessfully = false
  let claimedBeforeCooldownMutation: number | null = null

  const startedAtMs = Date.now()
  const leaseTtlSeconds = parseLeaseTtlSeconds()
  logger.info('Preview backlog drain started', {
    component: COMPONENT,
    operation: 'drain_start',
    reason: 'eligible',
    source,
    NODE_ENV,
    VERCEL_ENV,
    hasRedisEnv,
    cooldownMs,
    msSinceLastRun,
    batchSize,
    durationMs: 0,
  })
  try {
    if (!hasRedisEnv) {
      logger.warn('Preview backlog drain skipped: distributed lease unavailable', {
        component: COMPONENT,
        operation: 'lease_unavailable',
        reason: 'missing_redis_env',
        source,
        NODE_ENV,
        VERCEL_ENV,
        hasRedisEnv,
        cooldownMs,
        msSinceLastRun,
        batchSize,
        durationMs: Date.now() - startedAtMs,
      })
      return baseResult({
        status: 'lease_unavailable',
        reason: 'missing_redis_env',
        msSinceLastRun,
        durationMs: Date.now() - startedAtMs,
      })
    }

    let leaseAcquired = false
    try {
      leaseAcquired = await acquireRedisLease(leaseTtlSeconds)
    } catch (error) {
      logger.warn('Preview backlog drain skipped: lease acquisition errored', {
        component: COMPONENT,
        operation: 'lease_error',
        reason: 'lease_request_failed',
        source,
        NODE_ENV,
        VERCEL_ENV,
        hasRedisEnv,
        cooldownMs,
        msSinceLastRun,
        batchSize,
        durationMs: Date.now() - startedAtMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return baseResult({
        status: 'error',
        reason: 'lease_request_failed',
        msSinceLastRun,
        durationMs: Date.now() - startedAtMs,
      })
    }

    if (!leaseAcquired) {
      logger.warn('Preview backlog drain skipped: lease busy', {
        component: COMPONENT,
        operation: 'lease_busy',
        reason: 'lease_not_acquired',
        source,
        NODE_ENV,
        VERCEL_ENV,
        hasRedisEnv,
        cooldownMs,
        msSinceLastRun,
        batchSize,
        durationMs: Date.now() - startedAtMs,
      })
      return baseResult({
        status: 'lease_busy',
        reason: 'lease_not_acquired',
        msSinceLastRun,
        durationMs: Date.now() - startedAtMs,
      })
    }

    geocodeInvoked = true
    logger.info('Preview backlog drain invoking geocode worker', {
      component: COMPONENT,
      operation: 'geocode_pending_await_start',
      source,
      NODE_ENV,
      VERCEL_ENV,
      batchSize,
      durationMs: Date.now() - startedAtMs,
    })
    try {
      const summary = await geocodePendingSales({
        batchSizeOverride: batchSize,
        captureClaimedRowIds: true,
      })
      geocodeResolvedSuccessfully = true
      const claimed = Number(summary.claimed ?? 0)
      claimedBeforeCooldownMutation = claimed
      completedGeocodeWork = true
      const firstIds = (summary.claimedRowIds ?? []).slice(0, 5)
      logger.info('Preview backlog drain geocode await resolved', {
        component: COMPONENT,
        operation: 'geocode_pending_await_resolved',
        source,
        NODE_ENV,
        VERCEL_ENV,
        claimed,
        durationMs: Date.now() - startedAtMs,
      })
      const failed = Number(summary.failedRetriable ?? 0) + Number(summary.failedTerminal ?? 0)
      const publishTriggered = Number(summary.publishTriggered ?? 0)
      const publishOk = Number(summary.publishOk ?? 0)
      const publishFailed = Number(summary.publishFailed ?? 0)
      logger.info('Preview backlog drain completed', {
        component: COMPONENT,
        operation: 'drain_complete',
        reason: 'completed',
        source,
        NODE_ENV,
        VERCEL_ENV,
        hasRedisEnv,
        cooldownMs,
        msSinceLastRun,
        batchSize,
        claimed,
        processed: Number(summary.processed ?? 0),
        failed,
        publishTriggered,
        publishOk,
        publishFailed,
        firstClaimedRowIds: firstIds,
        durationMs: Date.now() - startedAtMs,
      })
      return baseResult({
        status: 'completed',
        reason: 'completed',
        claimed,
        processed: Number(summary.processed ?? 0),
        failed,
        publishTriggered,
        publishOk,
        publishFailed,
        geocodeInvoked: true,
        geocodeResolvedSuccessfully: true,
        cooldownTimestampMutated: true,
        msSinceLastRun,
        durationMs: Date.now() - startedAtMs,
        firstClaimedRowIds: firstIds,
      })
    } catch (error) {
      geocodeResolvedSuccessfully = false
      logger.warn('Preview backlog drain failed during geocode pending sales run', {
        component: COMPONENT,
        operation: 'drain_error',
        reason: 'geocode_pending_failed',
        source,
        NODE_ENV,
        VERCEL_ENV,
        hasRedisEnv,
        cooldownMs,
        msSinceLastRun,
        batchSize,
        durationMs: Date.now() - startedAtMs,
        geocodeInvoked: true,
        geocodeResolvedSuccessfully: false,
        cooldownTimestampMutated: false,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return baseResult({
        status: 'error',
        reason: 'geocode_pending_failed',
        geocodeInvoked: true,
        geocodeResolvedSuccessfully: false,
        cooldownTimestampMutated: false,
        msSinceLastRun,
        durationMs: Date.now() - startedAtMs,
      })
    }
  } finally {
    state.inFlight = false
    const cooldownTimestampMutated = completedGeocodeWork
    if (completedGeocodeWork) {
      state.lastCompletedAtMs = Date.now()
    }
    logger.info('Preview backlog drain lifecycle', {
      component: COMPONENT,
      operation: 'drain_lifecycle',
      source,
      NODE_ENV,
      VERCEL_ENV,
      hasRedisEnv,
      cooldownTimestampMutated,
      previousLastCompletedAtMs,
      lastCompletedAtMs: state.lastCompletedAtMs,
      geocodeInvoked,
      geocodeResolvedSuccessfully,
      claimedBeforeCooldownMutation: completedGeocodeWork ? claimedBeforeCooldownMutation : null,
      durationMs: Date.now() - startedAtMs,
    })
  }
}

export function __resetPreviewBacklogDrainStateForTests(): void {
  const root = globalThis as typeof globalThis & {
    __previewBacklogDrainState?: DrainState
  }
  root.__previewBacklogDrainState = {
    inFlight: false,
    lastCompletedAtMs: 0,
  }
}
