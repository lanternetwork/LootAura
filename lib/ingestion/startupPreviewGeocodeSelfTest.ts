import { logger } from '@/lib/log'
import { geocodePendingSales } from '@/lib/ingestion/geocodeWorker'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

const DEFAULT_BATCH_LIMIT = 2
const MAX_BATCH_LIMIT = 3
const DEFAULT_COOLDOWN_MINUTES = 2
const DEFAULT_LOCK_TTL_SECONDS = 10 * 60
const LOCK_KEY = 'ingestion:preview_geocode_self_test:lock'

function parseIntInRange(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function isPreviewSelfTestEnabled(): boolean {
  const isPreview = process.env.VERCEL_ENV === 'preview'
  const isRuntimeProduction = process.env.NODE_ENV === 'production'
  if (!isPreview || !isRuntimeProduction) return false
  return process.env.INGESTION_PREVIEW_GEOCODE_SELF_TEST_ENABLED !== 'false'
}

async function acquireLease(ttlSeconds: number): Promise<boolean> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!redisUrl || !redisToken) {
    logger.warn('Preview geocode self-test skipped: distributed lease unavailable', {
      component: 'ingestion/preview-geocode-self-test',
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

type StatusSnapshot = {
  id: string
  status: string | null
  lat: number | null
  lng: number | null
  published_sale_id: string | null
  geocode_attempts: number | null
}

async function readStatusSnapshots(ids: string[]): Promise<StatusSnapshot[]> {
  if (ids.length === 0) return []
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, status, lat, lng, published_sale_id, geocode_attempts')
    .in('id', ids)
  if (error || !Array.isArray(data)) return []
  return data as StatusSnapshot[]
}

async function readNeedsGeocodeReasonPath(cooldownMinutes: number): Promise<{
  needsGeocodeCount: number
  eligibleCount: number
  blockedByCooldownCount: number
  blockedByAttemptsCount: number
}> {
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, geocode_attempts, last_geocode_attempt_at')
    .eq('status', 'needs_geocode')
    .limit(200)
  if (error || !Array.isArray(data)) {
    return {
      needsGeocodeCount: 0,
      eligibleCount: 0,
      blockedByCooldownCount: 0,
      blockedByAttemptsCount: 0,
    }
  }

  const nowMs = Date.now()
  const cooldownMs = cooldownMinutes * 60 * 1000
  let eligibleCount = 0
  let blockedByCooldownCount = 0
  let blockedByAttemptsCount = 0
  for (const row of data as Array<{ geocode_attempts?: number | null; last_geocode_attempt_at?: string | null }>) {
    const attempts = Number(row.geocode_attempts ?? 0)
    if (attempts >= 3) {
      blockedByAttemptsCount += 1
      continue
    }
    const lastAttemptAt = row.last_geocode_attempt_at
    const lastAttemptMs = typeof lastAttemptAt === 'string' && lastAttemptAt.length > 0 ? Date.parse(lastAttemptAt) : Number.NaN
    const inCooldown = Number.isFinite(lastAttemptMs) && nowMs - lastAttemptMs < cooldownMs
    if (inCooldown) {
      blockedByCooldownCount += 1
      continue
    }
    eligibleCount += 1
  }

  return {
    needsGeocodeCount: data.length,
    eligibleCount,
    blockedByCooldownCount,
    blockedByAttemptsCount,
  }
}

export function startPreviewGeocodeSelfTest(): void {
  const state = globalThis as typeof globalThis & {
    __previewGeocodeSelfTestStarted?: boolean
  }

  if (!isPreviewSelfTestEnabled()) return
  if (state.__previewGeocodeSelfTestStarted) return
  state.__previewGeocodeSelfTestStarted = true

  const batchLimit = parseIntInRange(
    process.env.INGESTION_PREVIEW_GEOCODE_SELF_TEST_LIMIT,
    DEFAULT_BATCH_LIMIT,
    1,
    MAX_BATCH_LIMIT,
  )
  const cooldownMinutes = parseIntInRange(
    process.env.INGESTION_PREVIEW_GEOCODE_SELF_TEST_COOLDOWN_MINUTES,
    DEFAULT_COOLDOWN_MINUTES,
    0,
    60,
  )
  const lockTtlSeconds = parseIntInRange(
    process.env.INGESTION_PREVIEW_GEOCODE_SELF_TEST_LOCK_TTL_SECONDS,
    DEFAULT_LOCK_TTL_SECONDS,
    60,
    3600,
  )

  void (async () => {
    const startedAt = Date.now()
    try {
      const leaseAcquired = await acquireLease(lockTtlSeconds)
      if (!leaseAcquired) {
        logger.warn('Preview geocode self-test skipped: lease busy', {
          component: 'ingestion/preview-geocode-self-test',
          operation: 'lease_busy',
          batchLimit,
          cooldownMinutes,
          lockTtlSeconds,
        })
        return
      }

      const before = await readNeedsGeocodeReasonPath(cooldownMinutes)
      logger.info('Preview geocode self-test starting', {
        component: 'ingestion/preview-geocode-self-test',
        operation: 'self_test_start',
        batchLimit,
        cooldownMinutes,
        lockTtlSeconds,
        ...before,
      })

      const result = await geocodePendingSales({
        batchSizeOverride: batchLimit,
        cooldownMinutesOverride: cooldownMinutes,
        captureClaimedRowIds: true,
      })

      const claimedIds = (result.claimedRowIds ?? []).slice(0, MAX_BATCH_LIMIT)
      const snapshots = await readStatusSnapshots(claimedIds)
      const persistedCoordsCount = snapshots.filter((row) => row.lat != null && row.lng != null).length
      const readyCount = snapshots.filter((row) => row.status === 'ready').length
      const publishedCount = snapshots.filter((row) => row.status === 'published').length
      const publishedSaleLinkedCount = snapshots.filter((row) => !!row.published_sale_id).length

      if (result.claimed === 0) {
        const reasonPath = await readNeedsGeocodeReasonPath(cooldownMinutes)
        logger.warn('Preview geocode self-test claimed zero rows', {
          component: 'ingestion/preview-geocode-self-test',
          operation: 'self_test_zero_claimed',
          batchLimit,
          cooldownMinutes,
          ...reasonPath,
          durationMs: Date.now() - startedAt,
        })
      }

      logger.info('Preview geocode self-test completed', {
        component: 'ingestion/preview-geocode-self-test',
        operation: 'self_test_complete',
        batchLimit,
        cooldownMinutes,
        claimed: result.claimed,
        processed: result.processed ?? 0,
        failed: (result.failedRetriable ?? 0) + (result.failedTerminal ?? 0),
        succeeded: result.succeeded,
        failedRetriable: result.failedRetriable,
        failedTerminal: result.failedTerminal,
        rate429Count: result.rate429Count,
        publishTriggered: result.publishTriggered ?? 0,
        publishOk: result.publishOk ?? 0,
        publishFailed: result.publishFailed ?? 0,
        firstClaimedRowIds: claimedIds,
        resultingStatuses: snapshots.map((row) => ({
          id: row.id,
          status: row.status,
          hasCoords: row.lat != null && row.lng != null,
          hasPublishedSaleId: !!row.published_sale_id,
          geocodeAttempts: row.geocode_attempts,
        })),
        persistedCoordsCount,
        readyCount,
        publishedCount,
        publishedSaleLinkedCount,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      logger.warn('Preview geocode self-test skipped due to lease/runtime error', {
        component: 'ingestion/preview-geocode-self-test',
        operation: 'self_test_error',
        batchLimit,
        cooldownMinutes,
        lockTtlSeconds,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      })
    }
  })()
}

