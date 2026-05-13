/**
 * Pure ingestion operational health evaluation (Tier 0).
 * No I/O, clocks (caller passes referenceNowMs), env, logging, or vendors.
 */

import { classifyQueuePressure } from './metrics'

export type IngestionHealthStatus = 'healthy' | 'degraded' | 'critical'

export type IngestionHealthReason =
  | 'missing_signal'
  | 'stale_signal'
  | 'queue_pressure'
  | 'retry_exhaustion'
  | 'archive_lag'
  | 'lease_contention'
  | 'starvation_detected'

/** Structured snapshot assembled by the wiring layer (no PII). */
export interface IngestionHealthSignals {
  evaluatedAtIso: string

  queueDepth?: number
  staleBacklogAgeMs?: number

  starvationDetected?: boolean

  retryExhaustionCount?: number
  retryExhaustionRatio?: number

  publishFailureRate?: number
  geocodeFailureRate?: number

  archivePendingCount?: number

  leaseConflictCount?: number
}

export type IngestionHealthSignalKey = keyof IngestionHealthSignals

/** Thresholds and required-field policy supplied by wiring (may derive from env there). */
export interface IngestionHealthThresholds {
  /**
   * If wall-clock `referenceNowMs` minus parsed `evaluatedAtIso` exceeds this, status is at least
   * critical with `stale_signal` (snapshot is too old to trust).
   */
  snapshotStaleCriticalMs: number
  /**
   * Keys other than `evaluatedAtIso` that must be present (not `undefined`) for this evaluation.
   * Each missing entry contributes `missing_signal` and floors at degraded (never silently healthy).
   */
  requiredSignals: Exclude<IngestionHealthSignalKey, 'evaluatedAtIso'>[]

  queueHighWatermark: number
  queueCriticalMultiplier?: number

  /** Oldest backlog age (ms) at or above => degraded with `queue_pressure`. */
  staleBacklogDegradedMs: number
  /** Oldest backlog age (ms) at or above => critical with `queue_pressure`. */
  staleBacklogCriticalMs: number

  retryExhaustionCountDegraded: number
  retryExhaustionCountCritical: number
  retryExhaustionRatioDegraded: number
  retryExhaustionRatioCritical: number

  publishFailureRateDegraded: number
  publishFailureRateCritical: number
  geocodeFailureRateDegraded: number
  geocodeFailureRateCritical: number

  archivePendingDegraded: number
  archivePendingCritical: number

  leaseConflictDegraded: number
  leaseConflictCritical: number
}

export interface IngestionHealthEvaluation {
  status: IngestionHealthStatus
  reasons: IngestionHealthReason[]
}

type Severity = 0 | 1 | 2

function maxSeverity(a: Severity, b: Severity): Severity {
  return a > b ? a : b
}

function statusFromSeverity(s: Severity): IngestionHealthStatus {
  if (s >= 2) return 'critical'
  if (s >= 1) return 'degraded'
  return 'healthy'
}

function sortedUniqueReasons(reasons: IngestionHealthReason[]): IngestionHealthReason[] {
  const order: IngestionHealthReason[] = [
    'missing_signal',
    'stale_signal',
    'queue_pressure',
    'retry_exhaustion',
    'archive_lag',
    'lease_contention',
    'starvation_detected',
  ]
  const set = new Set(reasons)
  return order.filter((r) => set.has(r))
}

function parseEvaluatedAtMs(iso: string): number | null {
  if (iso == null || typeof iso !== 'string' || iso.trim() === '') return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function isPresent(value: unknown): boolean {
  return value !== undefined
}

function finiteOr(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * Deterministic fail-closed evaluation.
 * - Missing required fields => at least degraded + `missing_signal` (never healthy).
 * - Contradictory contributing rules => highest severity wins.
 * - Stale snapshot (clock skew vs `evaluatedAtIso`) => critical + `stale_signal`.
 */
export function evaluateIngestionHealth(
  signals: IngestionHealthSignals,
  thresholds: IngestionHealthThresholds,
  referenceNowMs: number
): IngestionHealthEvaluation {
  const reasons: IngestionHealthReason[] = []
  let maxSev: Severity = 0

  const push = (sev: Severity, reason: IngestionHealthReason) => {
    maxSev = maxSeverity(maxSev, sev)
    reasons.push(reason)
  }

  const evaluatedAtMs = parseEvaluatedAtMs(signals.evaluatedAtIso)
  if (evaluatedAtMs === null) {
    push(1, 'missing_signal')
  } else {
    const snapshotAgeMs = Math.max(0, referenceNowMs - evaluatedAtMs)
    if (snapshotAgeMs > thresholds.snapshotStaleCriticalMs) {
      push(2, 'stale_signal')
    }
  }

  for (const key of thresholds.requiredSignals) {
    if (!isPresent(signals[key])) {
      push(1, 'missing_signal')
    }
  }

  const depth = finiteOr(signals.queueDepth)
  if (depth !== null) {
    const qClass = classifyQueuePressure(depth, thresholds.queueHighWatermark, thresholds.queueCriticalMultiplier ?? 2)
    if (qClass === 'critical') push(2, 'queue_pressure')
    else if (qClass === 'high' || qClass === 'elevated') push(1, 'queue_pressure')
    else if (qClass === 'unknown') push(1, 'missing_signal')
  }

  const backlogAge = finiteOr(signals.staleBacklogAgeMs)
  if (backlogAge !== null) {
    if (backlogAge >= thresholds.staleBacklogCriticalMs) push(2, 'queue_pressure')
    else if (backlogAge >= thresholds.staleBacklogDegradedMs) push(1, 'queue_pressure')
  }

  if (signals.starvationDetected === true) {
    push(1, 'starvation_detected')
  }

  const retryCount = finiteOr(signals.retryExhaustionCount)
  if (retryCount !== null) {
    if (retryCount >= thresholds.retryExhaustionCountCritical) push(2, 'retry_exhaustion')
    else if (retryCount >= thresholds.retryExhaustionCountDegraded) push(1, 'retry_exhaustion')
  }

  const retryRatio = finiteOr(signals.retryExhaustionRatio)
  if (retryRatio !== null) {
    if (retryRatio >= thresholds.retryExhaustionRatioCritical) push(2, 'retry_exhaustion')
    else if (retryRatio >= thresholds.retryExhaustionRatioDegraded) push(1, 'retry_exhaustion')
  }

  const pubRate = finiteOr(signals.publishFailureRate)
  if (pubRate !== null) {
    if (pubRate >= thresholds.publishFailureRateCritical) push(2, 'queue_pressure')
    else if (pubRate >= thresholds.publishFailureRateDegraded) push(1, 'queue_pressure')
  }

  const geoRate = finiteOr(signals.geocodeFailureRate)
  if (geoRate !== null) {
    if (geoRate >= thresholds.geocodeFailureRateCritical) push(2, 'queue_pressure')
    else if (geoRate >= thresholds.geocodeFailureRateDegraded) push(1, 'queue_pressure')
  }

  const archivePending = finiteOr(signals.archivePendingCount)
  if (archivePending !== null) {
    if (archivePending >= thresholds.archivePendingCritical) push(2, 'archive_lag')
    else if (archivePending >= thresholds.archivePendingDegraded) push(1, 'archive_lag')
  }

  const leaseConflicts = finiteOr(signals.leaseConflictCount)
  if (leaseConflicts !== null) {
    if (leaseConflicts >= thresholds.leaseConflictCritical) push(2, 'lease_contention')
    else if (leaseConflicts >= thresholds.leaseConflictDegraded) push(1, 'lease_contention')
  }

  const uniqueReasons = sortedUniqueReasons(reasons)

  let status = statusFromSeverity(maxSev)
  if (uniqueReasons.length > 0 && status === 'healthy') {
    status = 'degraded'
  }

  return {
    status,
    reasons: uniqueReasons,
  }
}

/** Default thresholds for wiring / tests; tune in wiring via env merges. */
export function defaultIngestionHealthThresholds(): IngestionHealthThresholds {
  return {
    snapshotStaleCriticalMs: 180_000,
    requiredSignals: [],
    queueHighWatermark: 500,
    queueCriticalMultiplier: 2,
    staleBacklogDegradedMs: 15 * 60_000,
    staleBacklogCriticalMs: 2 * 60 * 60_000,
    retryExhaustionCountDegraded: 5,
    retryExhaustionCountCritical: 25,
    retryExhaustionRatioDegraded: 0.05,
    retryExhaustionRatioCritical: 0.25,
    publishFailureRateDegraded: 0.05,
    publishFailureRateCritical: 0.2,
    geocodeFailureRateDegraded: 0.08,
    geocodeFailureRateCritical: 0.3,
    archivePendingDegraded: 25,
    archivePendingCritical: 200,
    leaseConflictDegraded: 3,
    leaseConflictCritical: 20,
  }
}
