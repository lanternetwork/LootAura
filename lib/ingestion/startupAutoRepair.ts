import { logger } from '@/lib/log'
import { runIngestedSalesRepair } from '@/lib/ingestion/ingestedSalesRepair'

const DEFAULT_LIMIT = 250
const DEFAULT_LOCK_TTL_SECONDS = 10 * 60
const LOCK_KEY = 'ingestion:auto_repair:lock'

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function isAutoRepairEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return false
  return process.env.INGESTED_SALES_AUTO_REPAIR_ENABLED !== 'false'
}

async function acquireRedisLease(ttlSeconds: number): Promise<boolean> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    logger.warn('Auto repair skipped because distributed lease is unavailable (Upstash not configured)', {
      component: 'ingestion/auto-repair',
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

export function startIngestedSalesAutoRepair(): void {
  const autoRepairState = globalThis as typeof globalThis & {
    __ingestedSalesAutoRepairStarted?: boolean
  }
  if (!isAutoRepairEnabled()) return
  if (autoRepairState.__ingestedSalesAutoRepairStarted) return
  autoRepairState.__ingestedSalesAutoRepairStarted = true

  const limit = parsePositiveInt(process.env.INGESTED_SALES_AUTO_REPAIR_LIMIT, DEFAULT_LIMIT)
  const lockTtlSeconds = parsePositiveInt(
    process.env.INGESTED_SALES_AUTO_REPAIR_LOCK_TTL_SECONDS,
    DEFAULT_LOCK_TTL_SECONDS,
  )

  void (async () => {
    const startedAt = Date.now()
    try {
      const leaseAcquired = await acquireRedisLease(lockTtlSeconds)
      if (!leaseAcquired) {
        logger.info('Auto repair skipped because another instance holds lease', {
          component: 'ingestion/auto-repair',
          operation: 'lease_busy',
          limit,
          lockTtlSeconds,
        })
        return
      }

      const result = await runIngestedSalesRepair({ dryRun: false, limit })
      logger.info('Auto repair completed', {
        component: 'ingestion/auto-repair',
        operation: 'repair_complete',
        dryRun: false,
        limit,
        lockTtlSeconds,
        scanned: result.scanned,
        skipped: result.skipped,
        repairedIngestedDescription: result.repaired.ingestedDescription,
        repairedSalesDescription: result.repaired.salesDescription,
        repairedSalesAddress: result.repaired.salesAddress,
        writes: result.writes,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      logger.warn('Auto repair skipped because distributed lease acquisition failed', {
        component: 'ingestion/auto-repair',
        operation: 'lease_error',
        dryRun: false,
        limit,
        lockTtlSeconds,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      })
    }
  })()
}

