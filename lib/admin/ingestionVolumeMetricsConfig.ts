/** Read-only defaults aligned with `app/api/cron/daily/route.ts` for crawl schedule estimates. */

export function parseIngestionOrchestrationConfigBatchSizeForMetrics(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_CONFIG_BATCH_SIZE
  const defaultSize = 20
  if (raw === undefined || raw === '') return defaultSize
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultSize
  return Math.min(parsed, 500)
}

export function parseIngestionOrchestrationMinMinutesForMetrics(): number {
  const raw = process.env.INGESTION_ORCHESTRATION_MIN_MINUTES
  const defaultMinutes = 10
  if (raw === undefined || raw === '') return defaultMinutes
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMinutes
  return Math.min(parsed, 24 * 60)
}

/** Geocode backlog age thresholds for bottleneck classification (ms). */
export const GEOCODE_STALE_CRITICAL_MS = 2 * 60 * 60 * 1000
export const PUBLISH_STALE_CRITICAL_MS = 60 * 60 * 1000
