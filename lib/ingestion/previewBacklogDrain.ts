import { geocodePendingSales } from '@/lib/ingestion/geocodeWorker'
import { logger } from '@/lib/log'

const DEFAULT_BATCH_SIZE = 25
const MAX_BATCH_SIZE = 100
const DEFAULT_COOLDOWN_MINUTES = 3
const MIN_COOLDOWN_MINUTES = 2
const MAX_COOLDOWN_MINUTES = 5
const DEFAULT_LEASE_TTL_SECONDS = 120
const LOCK_KEY = 'ingestion:preview_backlog_drain:lock'

type DrainState = {
  inFlight: boolean
  lastCompletedAtMs: number
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
  if (!redisUrl || !redisToken) {
    logger.warn('Preview backlog drain skipped: distributed lease unavailable', {
      component: 'ingestion/preview-backlog-drain',
      operation: 'lease_unavailable',
    })
    return false
  }

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

export async function maybeRunPreviewBacklogDrain(trigger: string): Promise<void> {
  if (!isPreviewRuntime()) {
    return
  }

  const state = getState()
  const nowMs = Date.now()
  const cooldownMs = parseCooldownMinutes() * 60 * 1000
  if (state.inFlight) {
    return
  }
  if (state.lastCompletedAtMs > 0 && nowMs - state.lastCompletedAtMs < cooldownMs) {
    return
  }

  state.inFlight = true
  const startedAtMs = Date.now()
  const batchSize = parseBatchSize()
  const leaseTtlSeconds = parseLeaseTtlSeconds()
  try {
    const leaseAcquired = await acquireRedisLease(leaseTtlSeconds)
    if (!leaseAcquired) {
      logger.warn('Preview backlog drain skipped: lease busy', {
        component: 'ingestion/preview-backlog-drain',
        operation: 'lease_busy',
        trigger,
        batchSize,
        leaseTtlSeconds,
      })
      return
    }

    const summary = await geocodePendingSales({
      batchSizeOverride: batchSize,
      captureClaimedRowIds: true,
    })
    const failed = Number(summary.failedRetriable ?? 0) + Number(summary.failedTerminal ?? 0)
    logger.info('Preview backlog drain completed', {
      component: 'ingestion/preview-backlog-drain',
      operation: 'drain_complete',
      trigger,
      batchSize,
      leaseTtlSeconds,
      claimed: Number(summary.claimed ?? 0),
      processed: Number(summary.processed ?? 0),
      failed,
      publishTriggered: Number(summary.publishTriggered ?? 0),
      publishOk: Number(summary.publishOk ?? 0),
      publishFailed: Number(summary.publishFailed ?? 0),
      firstClaimedRowIds: (summary.claimedRowIds ?? []).slice(0, 3),
      durationMs: Date.now() - startedAtMs,
    })
  } catch (error) {
    logger.warn('Preview backlog drain skipped due to lease/runtime error', {
      component: 'ingestion/preview-backlog-drain',
      operation: 'drain_error',
      trigger,
      batchSize,
      leaseTtlSeconds,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAtMs,
    })
  } finally {
    state.lastCompletedAtMs = Date.now()
    state.inFlight = false
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

