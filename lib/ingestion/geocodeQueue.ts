import { ENV_SERVER } from '@/lib/env'
import { logger } from '@/lib/log'
import {
  MAX_GEOCODE_RETRIES,
  geocodeIngestedSaleById,
  publishAfterGeocodeSuccess,
} from '@/lib/ingestion/geocodeWorker'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

export type GeocodePriority = 'HIGH' | 'NORMAL'

export interface GeocodeJobPayload {
  sale_id: string
  priority: GeocodePriority
  attempts?: number
}

export interface GeocodeQueueBatchSummary {
  processed: number
  succeeded: number
  failedRetriable: number
  failedTerminal: number
  highProcessed: number
  normalProcessed: number
  queueAvailable: boolean
}

export interface GeocodeQueueMetrics {
  queue_length_high: number
  queue_length_normal: number
  queue_length_delayed: number
  total_jobs_pending: number
  recent_processing_stats: {
    last_run_processed: number
    last_run_failed: number
    last_run_duration_ms: number
  }
}

const HIGH_QUEUE_KEY = 'geocode_jobs:high'
const NORMAL_QUEUE_KEY = 'geocode_jobs:normal'
const DELAYED_QUEUE_KEY = 'geocode_jobs:delayed'
const STATS_KEY = 'geocode_jobs:stats'
const HIGH_BURST_LIMIT = 3
const DEFAULT_BATCH_SIZE = 8
const DEFAULT_MAX_BATCHES = 3
const DEFAULT_RETRY_BASE_MS = 2000
const DEFAULT_MAX_RETRY_DELAY_MS = 60000
const DEFAULT_MAX_HIGH_PER_MINUTE = 60
const DEFAULT_MAX_IDLE_LOOPS_FACTOR = 4

function getRedisConfig() {
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN
  if (!redisUrl || !redisToken) return null
  return { redisUrl, redisToken }
}

async function redisCommand(command: string, args: unknown[]): Promise<any> {
  const cfg = getRedisConfig()
  if (!cfg) throw new Error('REDIS_NOT_CONFIGURED')
  const response = await fetch(`${cfg.redisUrl}/${command}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!response.ok) {
    throw new Error(`Redis ${command} failed: ${response.status}`)
  }
  const data = await response.json() as { result: any }
  return data.result
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw ? Number.parseInt(raw, 10) : fallback
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function parseRateLimitRps(): number {
  const value = parseIntEnv('GEOCODE_QUEUE_MAX_RPS', 3)
  return Math.min(value, 20)
}

function parseBatchSize(): number {
  const value = parseIntEnv('GEOCODE_QUEUE_BATCH_SIZE', DEFAULT_BATCH_SIZE)
  return Math.min(value, 20)
}

function parseMaxBatchesPerRun(): number {
  const value = parseIntEnv('GEOCODE_QUEUE_MAX_BATCHES', DEFAULT_MAX_BATCHES)
  return Math.min(value, 10)
}

function parseMaxHighPerMinute(): number {
  const value = parseIntEnv('MAX_HIGH_PER_MINUTE', DEFAULT_MAX_HIGH_PER_MINUTE)
  return Math.min(value, 1000)
}

function parseMaxIdleLoopsFactor(): number {
  const value = parseIntEnv('GEOCODE_QUEUE_MAX_IDLE_LOOPS_FACTOR', DEFAULT_MAX_IDLE_LOOPS_FACTOR)
  return Math.min(value, 20)
}

function nextRetryDelayMs(attempts: number): number {
  const baseDelay = parseIntEnv('GEOCODE_QUEUE_RETRY_BASE_MS', DEFAULT_RETRY_BASE_MS)
  const maxDelay = parseIntEnv('GEOCODE_QUEUE_RETRY_MAX_MS', DEFAULT_MAX_RETRY_DELAY_MS)
  const exponential = baseDelay * Math.pow(2, Math.max(0, attempts - 1))
  return Math.min(exponential, maxDelay)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function queueAvailable(): boolean {
  return Boolean(getRedisConfig())
}

/** True when Redis env is set so enqueue + queue worker can run. */
export function isGeocodeQueueAvailable(): boolean {
  return queueAvailable()
}

async function moveReadyDelayedJobs(nowMs: number): Promise<number> {
  const jobs = await redisCommand('zrangebyscore', [DELAYED_QUEUE_KEY, '-inf', nowMs, 'LIMIT', 0, 100])
  const ids = Array.isArray(jobs) ? jobs : []
  let moved = 0
  for (const serialized of ids) {
    try {
      const parsed = JSON.parse(String(serialized)) as GeocodeJobPayload
      const targetQueue = parsed.priority === 'HIGH' ? HIGH_QUEUE_KEY : NORMAL_QUEUE_KEY
      await redisCommand('lpush', [targetQueue, JSON.stringify(parsed)])
      await redisCommand('zrem', [DELAYED_QUEUE_KEY, serialized])
      moved += 1
    } catch {
      await redisCommand('zrem', [DELAYED_QUEUE_KEY, serialized])
    }
  }
  return moved
}

export async function enqueueGeocodeJob(payload: GeocodeJobPayload): Promise<void> {
  if (!queueAvailable()) return
  const queueKey = payload.priority === 'HIGH' ? HIGH_QUEUE_KEY : NORMAL_QUEUE_KEY
  await redisCommand('lpush', [queueKey, JSON.stringify(payload)])
}

export async function enqueueGeocodeJobs(jobs: GeocodeJobPayload[]): Promise<{ enqueued: number; skipped: number }> {
  if (!queueAvailable()) {
    return { enqueued: 0, skipped: jobs.length }
  }
  let enqueued = 0
  for (const job of jobs) {
    await enqueueGeocodeJob(job)
    enqueued += 1
  }
  return { enqueued, skipped: 0 }
}

async function dequeueOne(highBudgetRemaining: number): Promise<{ job: GeocodeJobPayload | null; usedHigh: boolean }> {
  if (highBudgetRemaining > 0) {
    const highSerialized = await redisCommand('rpop', [HIGH_QUEUE_KEY])
    if (highSerialized) {
      return { job: JSON.parse(String(highSerialized)) as GeocodeJobPayload, usedHigh: true }
    }
  }
  const normalSerialized = await redisCommand('rpop', [NORMAL_QUEUE_KEY])
  if (normalSerialized) {
    return { job: JSON.parse(String(normalSerialized)) as GeocodeJobPayload, usedHigh: false }
  }
  const fallbackHigh = await redisCommand('rpop', [HIGH_QUEUE_KEY])
  if (fallbackHigh) {
    return { job: JSON.parse(String(fallbackHigh)) as GeocodeJobPayload, usedHigh: true }
  }
  return { job: null, usedHigh: false }
}

function highCountKeyForMinute(): string {
  const minute = Math.floor(Date.now() / 60000)
  return `geocode_jobs:high_count:${minute}`
}

async function shouldThrottleHighPriority(): Promise<boolean> {
  const key = highCountKeyForMinute()
  const count = await redisCommand('incr', [key])
  if (Number(count) === 1) {
    await redisCommand('expire', [key, 60])
  }
  return Number(count) > parseMaxHighPerMinute()
}

async function retryGeocodeJob(job: GeocodeJobPayload): Promise<void> {
  if (!queueAvailable()) return
  const attempts = Number(job.attempts || 0) + 1
  if (attempts >= MAX_GEOCODE_RETRIES) {
    const admin = getAdminDb()
    const { data: row } = await fromBase(admin, 'ingested_sales')
      .select('id, status, failure_reasons')
      .eq('id', job.sale_id)
      .maybeSingle()
    if (row && row.status === 'needs_geocode') {
      const reasons = Array.isArray(row.failure_reasons)
        ? row.failure_reasons.filter((x: unknown) => typeof x === 'string') as string[]
        : []
      const mergedReasons = reasons.includes('geocode_failed') ? reasons : [...reasons, 'geocode_failed']
      await fromBase(admin, 'ingested_sales')
        .update({
          status: 'needs_check',
          failure_reasons: mergedReasons,
        })
        .eq('id', job.sale_id)
        .eq('status', 'needs_geocode')
      logger.warn('geocode terminal failure', {
        component: 'ingestion/geocodeQueue',
        operation: 'retry_cap_terminal_failure',
        saleId: job.sale_id,
        attempts,
        maxRetries: MAX_GEOCODE_RETRIES,
      })
    }
    return
  }
  const nextJob: GeocodeJobPayload = {
    ...job,
    attempts,
  }
  const availableAt = Date.now() + nextRetryDelayMs(attempts)
  await redisCommand('zadd', [DELAYED_QUEUE_KEY, availableAt, JSON.stringify(nextJob)])
}

async function recordWorkerRunStats(summary: GeocodeQueueBatchSummary, durationMs: number): Promise<void> {
  if (!queueAvailable()) return
  const payload = {
    last_run_processed: summary.processed,
    last_run_failed: summary.failedRetriable + summary.failedTerminal,
    last_run_duration_ms: durationMs,
  }
  await redisCommand('set', [STATS_KEY, JSON.stringify(payload)])
}

async function safeReadQueueDepthSnapshot(): Promise<{ high: number; normal: number; delayed: number } | null> {
  try {
    const [high, normal, delayed] = await Promise.all([
      redisCommand('llen', [HIGH_QUEUE_KEY]),
      redisCommand('llen', [NORMAL_QUEUE_KEY]),
      redisCommand('zcard', [DELAYED_QUEUE_KEY]),
    ])
    return {
      high: Number(high || 0),
      normal: Number(normal || 0),
      delayed: Number(delayed || 0),
    }
  } catch {
    return null
  }
}

export async function getGeocodeQueueMetrics(): Promise<GeocodeQueueMetrics> {
  if (!queueAvailable()) {
    return {
      queue_length_high: 0,
      queue_length_normal: 0,
      queue_length_delayed: 0,
      total_jobs_pending: 0,
      recent_processing_stats: {
        last_run_processed: 0,
        last_run_failed: 0,
        last_run_duration_ms: 0,
      },
    }
  }

  const [high, normal, delayed, statsRaw] = await Promise.all([
    redisCommand('llen', [HIGH_QUEUE_KEY]),
    redisCommand('llen', [NORMAL_QUEUE_KEY]),
    redisCommand('zcard', [DELAYED_QUEUE_KEY]),
    redisCommand('get', [STATS_KEY]),
  ])

  const stats = (() => {
    try {
      return statsRaw ? JSON.parse(String(statsRaw)) : null
    } catch {
      return null
    }
  })()

  const queue_length_high = Number(high || 0)
  const queue_length_normal = Number(normal || 0)
  const queue_length_delayed = Number(delayed || 0)
  return {
    queue_length_high,
    queue_length_normal,
    queue_length_delayed,
    total_jobs_pending: queue_length_high + queue_length_normal + queue_length_delayed,
    recent_processing_stats: {
      last_run_processed: Number(stats?.last_run_processed || 0),
      last_run_failed: Number(stats?.last_run_failed || 0),
      last_run_duration_ms: Number(stats?.last_run_duration_ms || 0),
    },
  }
}

export async function processGeocodeQueueBatch(): Promise<GeocodeQueueBatchSummary> {
  const summary: GeocodeQueueBatchSummary = {
    processed: 0,
    succeeded: 0,
    failedRetriable: 0,
    failedTerminal: 0,
    highProcessed: 0,
    normalProcessed: 0,
    queueAvailable: queueAvailable(),
  }
  if (!summary.queueAvailable) return summary

  const batchSize = parseBatchSize()
  const maxRps = parseRateLimitRps()
  const minSpacingMs = Math.ceil(1000 / Math.max(1, maxRps))
  await moveReadyDelayedJobs(Date.now())

  let highBudgetRemaining = HIGH_BURST_LIMIT
  let processedInBatch = 0
  let nextAllowedAt = 0
  let rowsBecameReady = 0
  let idleLoops = 0
  const maxIdleLoops = Math.max(batchSize, batchSize * parseMaxIdleLoopsFactor())

  while (processedInBatch < batchSize) {
    if (idleLoops >= maxIdleLoops) {
      const queueDepths = await safeReadQueueDepthSnapshot()
      logger.warn('geocode queue batch stopped after idle loop guard', {
        component: 'ingestion/geocodeQueue',
        operation: 'idle_loop_guard',
        idleLoops,
        maxIdleLoops,
        processedInBatch,
        queueDepths,
        jobsMayRemainQueued: true,
      })
      break
    }

    const { job, usedHigh } = await dequeueOne(highBudgetRemaining)
    if (!job) break

    let jobToProcess = job
    if (usedHigh && jobToProcess) {
      const throttled = await shouldThrottleHighPriority()
      if (throttled) {
        // Requeue throttled HIGH jobs to NORMAL to preserve work and avoid starvation.
        // processedInBatch is intentionally unchanged because no geocode work occurred.
        jobToProcess = { ...jobToProcess, priority: 'NORMAL' }
        await enqueueGeocodeJob(jobToProcess)
        logger.warn('priority throttled to NORMAL', {
          component: 'ingestion/geocodeQueue',
          operation: 'priority_throttle',
          saleId: job.sale_id,
        })
        idleLoops += 1
        continue
      }
    }

    if (usedHigh) {
      highBudgetRemaining = Math.max(0, highBudgetRemaining - 1)
      summary.highProcessed += 1
    } else {
      highBudgetRemaining = HIGH_BURST_LIMIT
      summary.normalProcessed += 1
    }

    const waitMs = Math.max(0, nextAllowedAt - Date.now())
    if (waitMs > 0) {
      await sleep(waitMs)
    }

    const result = await geocodeIngestedSaleById(jobToProcess.sale_id, { skipPublishAfterSuccess: true })
    nextAllowedAt = Date.now() + minSpacingMs
    processedInBatch += 1
    idleLoops = 0
    summary.processed += 1

    if (!result) {
      // Row is already processed, not claimable yet, or missing; treat as no-op success.
      summary.succeeded += 1
      continue
    }
    if (result.success) {
      rowsBecameReady += 1
      summary.succeeded += 1
      continue
    }
    if (result.terminalFailure) {
      summary.failedTerminal += 1
      continue
    }
    summary.failedRetriable += 1
    await retryGeocodeJob(jobToProcess)
  }

  if (rowsBecameReady > 0) {
    await publishAfterGeocodeSuccess({ source: 'single', succeededCount: rowsBecameReady })
  }

  return summary
}

export async function runGeocodeQueueWorker(): Promise<GeocodeQueueBatchSummary> {
  const startedAt = Date.now()
  const finalSummary: GeocodeQueueBatchSummary = {
    processed: 0,
    succeeded: 0,
    failedRetriable: 0,
    failedTerminal: 0,
    highProcessed: 0,
    normalProcessed: 0,
    queueAvailable: queueAvailable(),
  }
  if (!finalSummary.queueAvailable) return finalSummary

  const maxBatches = parseMaxBatchesPerRun()
  for (let i = 0; i < maxBatches; i += 1) {
    const batch = await processGeocodeQueueBatch()
    finalSummary.processed += batch.processed
    finalSummary.succeeded += batch.succeeded
    finalSummary.failedRetriable += batch.failedRetriable
    finalSummary.failedTerminal += batch.failedTerminal
    finalSummary.highProcessed += batch.highProcessed
    finalSummary.normalProcessed += batch.normalProcessed
    if (batch.processed === 0) break
  }
  await recordWorkerRunStats(finalSummary, Date.now() - startedAt)
  return finalSummary
}

export async function runGeocodeQueueWorkerSingleBatch(): Promise<GeocodeQueueBatchSummary> {
  const startedAt = Date.now()
  const summary = await processGeocodeQueueBatch()
  await recordWorkerRunStats(summary, Date.now() - startedAt)
  return summary
}

export async function sweepNeedsGeocodeToQueue(limit: number = 200): Promise<{ enqueued: number; skipped: number }> {
  if (!queueAvailable()) return { enqueued: 0, skipped: 0 }
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, source_platform')
    .eq('status', 'needs_geocode')
    .lt('geocode_attempts', MAX_GEOCODE_RETRIES)
    .limit(limit)

  if (error) {
    logger.error('Failed to sweep needs_geocode rows for queue', new Error(error.message), {
      component: 'ingestion/geocodeQueue',
      operation: 'sweep',
      limit,
    })
    return { enqueued: 0, skipped: 0 }
  }

  const rows = Array.isArray(data) ? data : []
  const jobs = rows.map((row: any) => ({
    sale_id: String(row.id),
    priority: row.source_platform === 'external_page_source' ? 'HIGH' as const : 'NORMAL' as const,
  }))
  return enqueueGeocodeJobs(jobs)
}
