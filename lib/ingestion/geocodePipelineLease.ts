import {
  acquireIngestionOrchestrationLease,
  releaseIngestionOrchestrationLease,
  type IngestionOrchestrationLease,
} from '@/lib/ingestion/ingestionOrchestrationLease'

/** Shared lease key for `/api/cron/geocode` and daily orchestration geocode steps. */
export const GEOCODE_PIPELINE_ORCHESTRATION_STATE_KEY = 'geocode_pipeline' as const

export function parseGeocodePipelineLeaseSeconds(raw?: string): number {
  const defaultSeconds = 90
  if (raw === undefined || raw === '') return defaultSeconds
  const parsed = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(parsed) || parsed < 30) return defaultSeconds
  return Math.min(parsed, 300)
}

export type GeocodePipelineLeaseRunResult<T> =
  | { ok: true; skipped: false; result: T; lease: IngestionOrchestrationLease }
  | { ok: true; skipped: true; reason: 'active_lease' | 'acquire_failed'; lease: IngestionOrchestrationLease }

export async function runWithGeocodePipelineLease<T>(params: {
  execute: () => Promise<T>
  logContext: Record<string, unknown>
}): Promise<GeocodePipelineLeaseRunResult<T>> {
  const lease = await acquireIngestionOrchestrationLease(GEOCODE_PIPELINE_ORCHESTRATION_STATE_KEY, {
    ...params.logContext,
    operation: 'geocode_pipeline_lease_acquire',
  })

  if (!lease.acquired) {
    return {
      ok: true,
      skipped: true,
      reason: lease.reason === 'acquire_failed' ? 'acquire_failed' : 'active_lease',
      lease,
    }
  }

  try {
    const result = await params.execute()
    return { ok: true, skipped: false, result, lease }
  } finally {
    await releaseIngestionOrchestrationLease(GEOCODE_PIPELINE_ORCHESTRATION_STATE_KEY, {
      ...params.logContext,
      operation: 'geocode_pipeline_lease_release',
    }, {
      owner: lease.owner,
      nextCursor: lease.cursor,
      markCompleted: false,
    })
  }
}
