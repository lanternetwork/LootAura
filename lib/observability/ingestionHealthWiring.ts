/**
 * Wiring: collects ingestion signals (DB/Redis), runs the pure evaluator, optionally reports to Sentry.
 * All side effects and env parsing live here — not in `ingestionHealth.ts`.
 */

import { getGeocodeQueueDepths } from '@/lib/ingestion/geocodeQueue'
import { getAdminDb } from '@/lib/supabase/clients'
import { getPendingArchiveCounts } from '@/lib/sales/archiveEndedSalesSqlBatch'
import {
  defaultIngestionHealthThresholds,
  evaluateIngestionHealth,
  type IngestionHealthEvaluation,
  type IngestionHealthSignals,
  type IngestionHealthThresholds,
} from './ingestionHealth'
import { reportIngestionHealthEvaluation } from './reportIngestionHealth'

type AdminDb = ReturnType<typeof getAdminDb>

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function parseEnvFloat(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

/** Thresholds with env overrides (optional). Safe defaults from `defaultIngestionHealthThresholds`. */
export function loadIngestionHealthThresholdsFromEnv(): IngestionHealthThresholds {
  const base = defaultIngestionHealthThresholds()
  return {
    ...base,
    snapshotStaleCriticalMs: parseEnvInt(
      'INGESTION_HEALTH_SNAPSHOT_STALE_CRITICAL_MS',
      base.snapshotStaleCriticalMs,
      5_000,
      86_400_000
    ),
    queueHighWatermark: parseEnvInt('INGESTION_HEALTH_QUEUE_HIGH_WATERMARK', base.queueHighWatermark, 1, 1_000_000),
    archivePendingDegraded: parseEnvInt(
      'INGESTION_HEALTH_ARCHIVE_PENDING_DEGRADED',
      base.archivePendingDegraded,
      0,
      1_000_000
    ),
    archivePendingCritical: parseEnvInt(
      'INGESTION_HEALTH_ARCHIVE_PENDING_CRITICAL',
      base.archivePendingCritical,
      0,
      1_000_000
    ),
    publishFailureRateDegraded: parseEnvFloat(
      'INGESTION_HEALTH_PUBLISH_FAIL_RATE_DEGRADED',
      base.publishFailureRateDegraded,
      0,
      1
    ),
    publishFailureRateCritical: parseEnvFloat(
      'INGESTION_HEALTH_PUBLISH_FAIL_RATE_CRITICAL',
      base.publishFailureRateCritical,
      0,
      1
    ),
    geocodeFailureRateDegraded: parseEnvFloat(
      'INGESTION_HEALTH_GEOCODE_FAIL_RATE_DEGRADED',
      base.geocodeFailureRateDegraded,
      0,
      1
    ),
    geocodeFailureRateCritical: parseEnvFloat(
      'INGESTION_HEALTH_GEOCODE_FAIL_RATE_CRITICAL',
      base.geocodeFailureRateCritical,
      0,
      1
    ),
  }
}

export function buildIngestionHealthThresholdsForWiring(
  overrides?: Partial<IngestionHealthThresholds>
): IngestionHealthThresholds {
  const fromEnv = loadIngestionHealthThresholdsFromEnv()
  return {
    ...fromEnv,
    ...overrides,
    requiredSignals: overrides?.requiredSignals ?? ['queueDepth'],
  }
}

/**
 * Snapshot queue + archive signals for the evaluator. Merge `partial` for worker/cron fields
 * (rates, starvation, lease counts) without Redis/DB access inside the evaluator.
 */
export async function collectIngestionHealthSignals(options: {
  nowMs: number
  admin?: AdminDb
  partial?: Partial<IngestionHealthSignals>
}): Promise<IngestionHealthSignals> {
  const admin = options.admin ?? getAdminDb()
  const [depths, pending] = await Promise.all([getGeocodeQueueDepths(), getPendingArchiveCounts(admin)])

  const { evaluatedAtIso: partialEvalIso, ...restPartial } = options.partial ?? {}
  const evaluatedAtIso = partialEvalIso ?? new Date(options.nowMs).toISOString()

  const archivePendingCount =
    pending == null ? undefined : pending.pending_via_ends_at + pending.pending_via_legacy

  return {
    queueDepth: depths?.total,
    archivePendingCount,
    ...restPartial,
    evaluatedAtIso,
  }
}

export type RunIngestionHealthPipelineResult = {
  signals: IngestionHealthSignals
  evaluation: IngestionHealthEvaluation
}

/**
 * Collect → evaluate → optionally report transitions to Sentry (bounded; deduped in reporter).
 */
export async function runIngestionHealthPipeline(options?: {
  nowMs?: number
  admin?: AdminDb
  signalOverrides?: Partial<IngestionHealthSignals>
  thresholds?: Partial<IngestionHealthThresholds>
  reportToSentry?: boolean
}): Promise<RunIngestionHealthPipelineResult> {
  const nowMs = options?.nowMs ?? Date.now()
  const thresholds = buildIngestionHealthThresholdsForWiring(options?.thresholds)
  const signals = await collectIngestionHealthSignals({
    nowMs,
    admin: options?.admin,
    partial: options?.signalOverrides,
  })
  const evaluation = evaluateIngestionHealth(signals, thresholds, nowMs)
  if (options?.reportToSentry !== false) {
    reportIngestionHealthEvaluation(evaluation, nowMs)
  }
  return { signals, evaluation }
}
