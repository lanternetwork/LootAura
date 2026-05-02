import { randomUUID } from 'crypto'
import { ENV_SERVER } from '@/lib/env'
import { geocodeIngestedSaleById, type GeocodeIngestedSaleByIdResult } from '@/lib/ingestion/geocodeWorker'
import { logger } from '@/lib/log'

const QUEUE_HIGH = 'ingestion:geocode:queue:high'
const QUEUE_NORMAL = 'ingestion:geocode:queue:normal'
const JOB_PREFIX = 'ingestion:geocode:job:'
const JOB_TTL_SECONDS = 7 * 24 * 60 * 60

export type GeocodeJobPriority = 'high' | 'normal'

export interface GeocodeQueueJob {
  jobId: string
  saleId: string
  /** Debug/visibility only; retry eligibility comes from `geocodeIngestedSaleById` (DB-backed), not this field. */
  attempts: number
  priority: GeocodeJobPriority
}

export interface RequeueResult {
  ok: boolean
  reason?: 'redis'
}

export interface ProcessGeocodeQueueBatchSummary {
  dequeued: number
  completed: number
  requeued: number
}

interface RedisResponse {
  result: unknown
}

function jobKey(jobId: string): string {
  return `${JOB_PREFIX}${jobId}`
}

async function getRedisConfig(): Promise<{ redisUrl: string; redisToken: string }> {
  const redisUrl = ENV_SERVER.UPSTASH_REDIS_REST_URL
  const redisToken = ENV_SERVER.UPSTASH_REDIS_REST_TOKEN
  if (!redisUrl || !redisToken) {
    throw new Error('REDIS_NOT_CONFIGURED')
  }
  return { redisUrl, redisToken }
}

async function redisCommand(command: string, args: unknown[]): Promise<unknown> {
  const { redisUrl, redisToken } = await getRedisConfig()
  const response = await fetch(`${redisUrl}/${command}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!response.ok) {
    throw new Error(`Redis ${command} failed: ${response.status}`)
  }
  const data = (await response.json()) as RedisResponse
  return data.result
}

export function isGeocodeQueueConfigured(): boolean {
  return Boolean(ENV_SERVER.UPSTASH_REDIS_REST_URL && ENV_SERVER.UPSTASH_REDIS_REST_TOKEN)
}

function parseJobPayload(raw: unknown, jobId: string): GeocodeQueueJob | null {
  if (typeof raw !== 'string') {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as {
      saleId?: string
      attempts?: number
      priority?: GeocodeJobPriority
    }
    if (!parsed.saleId || typeof parsed.saleId !== 'string') {
      return null
    }
    const attempts = typeof parsed.attempts === 'number' && Number.isFinite(parsed.attempts) ? parsed.attempts : 0
    const priority: GeocodeJobPriority = parsed.priority === 'high' ? 'high' : 'normal'
    return { jobId, saleId: parsed.saleId, attempts, priority }
  } catch {
    return null
  }
}

/**
 * Enqueue a geocode job. LPUSH + FIFO RPOP drain (high before normal in dequeue).
 */
export async function enqueue(
  saleId: string,
  options?: { priority?: GeocodeJobPriority }
): Promise<string | null> {
  if (!isGeocodeQueueConfigured()) {
    return null
  }
  const priority: GeocodeJobPriority = options?.priority === 'high' ? 'high' : 'normal'
  const jobId = randomUUID()
  const payload = JSON.stringify({
    saleId,
    attempts: 0,
    priority,
  })
  const list = priority === 'high' ? QUEUE_HIGH : QUEUE_NORMAL

  try {
    await redisCommand('set', [jobKey(jobId), payload])
    await redisCommand('expire', [jobKey(jobId), JOB_TTL_SECONDS])
    await redisCommand('lpush', [list, jobId])
    return jobId
  } catch (error) {
    logger.error(
      'Geocode queue enqueue failed',
      error instanceof Error ? error : new Error(String(error)),
      { component: 'ingestion/geocodeQueue', operation: 'enqueue', saleId }
    )
    return null
  }
}

async function rpopSingle(listKey: string): Promise<string | null> {
  const id = await redisCommand('rpop', [listKey])
  return typeof id === 'string' && id.length > 0 ? id : null
}

async function lpushJobId(listKey: string, jobId: string): Promise<void> {
  await redisCommand('lpush', [listKey, jobId])
}

async function getJobPayload(jobId: string): Promise<string | null> {
  const raw = await redisCommand('get', [jobKey(jobId)])
  return typeof raw === 'string' ? raw : null
}

async function deleteJobRecord(jobId: string): Promise<void> {
  try {
    await redisCommand('del', [jobKey(jobId)])
  } catch {
    // best-effort cleanup
  }
}

/**
 * Pop up to `limit` jobs (high queue first, then normal). Removes job IDs from lists;
 * callers must complete, requeue, or restore via `requeue` / `processGeocodeQueueBatch`.
 */
export async function dequeueBatch(limit: number): Promise<GeocodeQueueJob[]> {
  if (!isGeocodeQueueConfigured()) {
    return []
  }
  const safeLimit = Math.max(0, Math.min(500, Math.floor(limit)))
  const jobs: GeocodeQueueJob[] = []

  for (let i = 0; i < safeLimit; i++) {
    let jobId = await rpopSingle(QUEUE_HIGH)
    let sourceList: GeocodeJobPriority = 'high'
    if (!jobId) {
      jobId = await rpopSingle(QUEUE_NORMAL)
      sourceList = 'normal'
    }
    if (!jobId) {
      break
    }

    const payload = await getJobPayload(jobId)
    if (!payload) {
      logger.warn('Geocode queue: job id popped but payload missing; restoring id to queue', {
        component: 'ingestion/geocodeQueue',
        operation: 'dequeue_missing_payload',
        jobId,
        sourceList,
      })
      await lpushJobId(sourceList === 'high' ? QUEUE_HIGH : QUEUE_NORMAL, jobId)
      continue
    }

    const job = parseJobPayload(payload, jobId)
    if (!job) {
      logger.warn('Geocode queue: corrupt job payload; restoring id to queue', {
        component: 'ingestion/geocodeQueue',
        operation: 'dequeue_corrupt_payload',
        jobId,
      })
      await lpushJobId(sourceList === 'high' ? QUEUE_HIGH : QUEUE_NORMAL, jobId)
      continue
    }

    jobs.push(job)
  }

  return jobs
}

/**
 * Re-add a job for retry. Increments `attempts` in Redis for visibility only; whether another run is useful is
 * decided by the worker / DB (`geocode_attempts`, status), not by this counter.
 * Retries are pushed to the normal list (simple deprioritization).
 */
export async function requeue(job: GeocodeQueueJob): Promise<RequeueResult> {
  if (!isGeocodeQueueConfigured()) {
    return { ok: false, reason: 'redis' }
  }

  const nextAttempts = Number.isFinite(job.attempts) ? job.attempts + 1 : 1
  const payload = JSON.stringify({
    saleId: job.saleId,
    attempts: nextAttempts,
    priority: job.priority,
  })

  try {
    await redisCommand('set', [jobKey(job.jobId), payload])
    await redisCommand('expire', [jobKey(job.jobId), JOB_TTL_SECONDS])
    await redisCommand('lpush', [QUEUE_NORMAL, job.jobId])
    return { ok: true }
  } catch (error) {
    logger.error(
      'Geocode queue requeue failed',
      error instanceof Error ? error : new Error(String(error)),
      { component: 'ingestion/geocodeQueue', operation: 'requeue', jobId: job.jobId, saleId: job.saleId }
    )
    return { ok: false, reason: 'redis' }
  }
}

async function restoreJobIdToHead(listKey: string, jobId: string): Promise<void> {
  try {
    await lpushJobId(listKey, jobId)
  } catch (error) {
    logger.error(
      'Geocode queue emergency restore failed — job may be stranded until manual fix',
      error instanceof Error ? error : new Error(String(error)),
      { component: 'ingestion/geocodeQueue', operation: 'restore_job_id', jobId, listKey }
    )
  }
}

/** Requeue only when the worker reports a retriable geocode outcome (DB still owns terminal vs retry). */
function shouldRequeueAfterWorkerResult(result: GeocodeIngestedSaleByIdResult): boolean {
  return result.outcome === 'geocode_failed' && result.retriable === true
}

function isTerminalQueueOutcome(result: GeocodeIngestedSaleByIdResult): boolean {
  if (result.outcome === 'success') {
    return true
  }
  if (result.outcome === 'skipped') {
    return true
  }
  if (result.outcome === 'geocode_failed' && !result.retriable) {
    return true
  }
  if (result.outcome === 'publish_failed') {
    return true
  }
  return false
}

/**
 * Drain up to `limit` jobs and invoke `geocodeIngestedSaleById` for each.
 * Requeues when the worker returns `geocode_failed` with `retriable: true` (DB is source of truth for exhaustion).
 * On throw (no structured result), requeues to preserve at-least-once delivery; if requeue fails, restores the job id.
 *
 * Invariant: a dequeued job is either completed (Redis job key removed), requeued onto a list, or restored to a list.
 */
export async function processGeocodeQueueBatch(limit: number): Promise<ProcessGeocodeQueueBatchSummary> {
  const summary: ProcessGeocodeQueueBatchSummary = {
    dequeued: 0,
    completed: 0,
    requeued: 0,
  }

  if (!isGeocodeQueueConfigured()) {
    return summary
  }

  const jobs = await dequeueBatch(limit)
  summary.dequeued = jobs.length

  for (const job of jobs) {
    try {
      const result = await geocodeIngestedSaleById(job.saleId)

      if (shouldRequeueAfterWorkerResult(result)) {
        const rq = await requeue(job)
        if (rq.ok) {
          summary.requeued += 1
        } else {
          await restoreJobIdToHead(QUEUE_NORMAL, job.jobId)
          summary.requeued += 1
        }
      } else if (isTerminalQueueOutcome(result)) {
        await deleteJobRecord(job.jobId)
        summary.completed += 1
      } else {
        await deleteJobRecord(job.jobId)
        summary.completed += 1
      }
    } catch (error) {
      logger.error(
        'Geocode queue batch item threw',
        error instanceof Error ? error : new Error(String(error)),
        { component: 'ingestion/geocodeQueue', operation: 'process_item', saleId: job.saleId, jobId: job.jobId }
      )

      const rq = await requeue(job)
      if (rq.ok) {
        summary.requeued += 1
      } else {
        await restoreJobIdToHead(QUEUE_NORMAL, job.jobId)
        summary.requeued += 1
      }
    }
  }

  return summary
}
