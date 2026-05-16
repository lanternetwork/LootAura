/**
 * Pure geocode provider degradation classifier (Tier 0).
 * No I/O, env, logging, or vendors — callers supply bounded numeric signals.
 */

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable'

export type ProviderHealthReason =
  | 'high_429_ratio'
  | 'high_timeout_ratio'
  | 'consecutive_unhealthy_batches'
  | 'queue_depth_growing'
  | 'high_retry_exhaustion_rate'
  | 'poison_row_isolation_signal'
  | 'invalid_metrics'

export interface ProviderHealthSignals {
  /** HTTP 429 outcomes / max(1, attemptsInBatch) — 0..1 */
  recent429Ratio: number
  /**
   * Transport / provider instability proxy: `fetch_exception` (and similar) / max(1, attemptsInBatch).
   * Treat as “timeout-like” pressure when explicit timeout classification is unavailable.
   */
  timeoutRatio: number
  /** Caller-maintained streak across batches when prior classifications were not healthy. */
  consecutiveFailures: number
  /** Optional: positive values mean Redis (or equivalent) queue depth grew during the window. */
  staleQueueGrowth?: number
  /** Terminal geocode failures / max(1, attemptsInBatch) — 0..1 */
  retryExhaustionRate: number
  /** Max repeated empty-result fingerprint count in batch (poison-row pressure, no PII). */
  maxRepeatedEmptyFingerprintCount?: number
}

export interface ProviderHealthThresholds {
  ratio429Degraded: number
  ratio429Unavailable: number
  timeoutRatioDegraded: number
  timeoutRatioUnavailable: number
  /** Consecutive unhealthy batches before `consecutive_unhealthy_batches` contributes at degraded severity. */
  consecutiveDegraded: number
  /** Streak length that contributes toward unavailable together with ratios. */
  consecutiveUnavailable: number
  /** Positive queue depth delta at or above triggers `queue_depth_growing`. */
  queueGrowthCritical: number
  retryExhaustionDegraded: number
  retryExhaustionUnavailable: number
  poisonFingerprintDegraded: number
  poisonFingerprintUnavailable: number
  /** Minimum streak of unhealthy batches before `shouldPauseNewClaims` when status is degraded. */
  pauseClaimsMinConsecutiveDegraded: number
  /** Hard cap for suggested backoff (ms). */
  maxRetryBackoffMs: number
}

export interface ProviderHealthDecision {
  status: ProviderHealthStatus
  reasons: ProviderHealthReason[]
  retryBackoffMs: number
  shouldReduceConcurrency: boolean
  shouldPauseNewClaims: boolean
}

type Severity = 0 | 1 | 2

function maxSev(a: Severity, b: Severity): Severity {
  return (a > b ? a : b) as Severity
}

function clampRatio(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(1, Math.max(0, n))
}

function clampNonNeg(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
  return n
}

function sortedUniqueReasons(reasons: ProviderHealthReason[]): ProviderHealthReason[] {
  const order: ProviderHealthReason[] = [
    'invalid_metrics',
    'high_429_ratio',
    'high_timeout_ratio',
    'consecutive_unhealthy_batches',
    'queue_depth_growing',
    'high_retry_exhaustion_rate',
    'poison_row_isolation_signal',
  ]
  const set = new Set(reasons)
  return order.filter((r) => set.has(r))
}

function statusFromSeverity(s: Severity): ProviderHealthStatus {
  if (s >= 2) return 'unavailable'
  if (s >= 1) return 'degraded'
  return 'healthy'
}

export function defaultProviderHealthThresholds(): ProviderHealthThresholds {
  return {
    ratio429Degraded: 0.12,
    ratio429Unavailable: 0.35,
    timeoutRatioDegraded: 0.18,
    timeoutRatioUnavailable: 0.42,
    consecutiveDegraded: 2,
    consecutiveUnavailable: 4,
    queueGrowthCritical: 15,
    retryExhaustionDegraded: 0.12,
    retryExhaustionUnavailable: 0.35,
    poisonFingerprintDegraded: 3,
    poisonFingerprintUnavailable: 8,
    pauseClaimsMinConsecutiveDegraded: 4,
    maxRetryBackoffMs: 60_000,
  }
}

/**
 * Fail-closed: invalid ratios are treated as worst-case for that dimension (ratio=1).
 * Highest-severity rule wins; reasons aggregate all contributing factors.
 */
export function classifyProviderHealth(
  signals: ProviderHealthSignals,
  thresholds: ProviderHealthThresholds
): ProviderHealthDecision {
  const reasons: ProviderHealthReason[] = []
  let maxSeverity: Severity = 0

  const push = (sev: Severity, reason: ProviderHealthReason) => {
    maxSeverity = maxSev(maxSeverity, sev)
    reasons.push(reason)
  }

  const r429 = clampRatio(signals.recent429Ratio)
  const rTo = clampRatio(signals.timeoutRatio)
  const rEx = clampRatio(signals.retryExhaustionRate)
  const cons = clampNonNeg(signals.consecutiveFailures)
  const qGrowth = signals.staleQueueGrowth
  const qGrowthN = typeof qGrowth === 'number' && Number.isFinite(qGrowth) ? qGrowth : null
  const poison = clampNonNeg(signals.maxRepeatedEmptyFingerprintCount)

  if (r429 === null || rTo === null || rEx === null || cons === null) {
    push(1, 'invalid_metrics')
  }

  const eff429 = r429 === null ? 1 : r429
  const effTo = rTo === null ? 1 : rTo
  const effEx = rEx === null ? 1 : rEx
  const effCons = cons === null ? 0 : cons

  if (eff429 >= thresholds.ratio429Unavailable) push(2, 'high_429_ratio')
  else if (eff429 >= thresholds.ratio429Degraded) push(1, 'high_429_ratio')

  if (effTo >= thresholds.timeoutRatioUnavailable) push(2, 'high_timeout_ratio')
  else if (effTo >= thresholds.timeoutRatioDegraded) push(1, 'high_timeout_ratio')

  if (effEx >= thresholds.retryExhaustionUnavailable) push(2, 'high_retry_exhaustion_rate')
  else if (effEx >= thresholds.retryExhaustionDegraded) push(1, 'high_retry_exhaustion_rate')

  if (qGrowthN != null && qGrowthN >= thresholds.queueGrowthCritical) {
    push(1, 'queue_depth_growing')
  }

  if (poison != null) {
    if (poison >= thresholds.poisonFingerprintUnavailable) push(2, 'poison_row_isolation_signal')
    else if (poison >= thresholds.poisonFingerprintDegraded) push(1, 'poison_row_isolation_signal')
  }

  if (effCons >= thresholds.consecutiveUnavailable) {
    push(2, 'consecutive_unhealthy_batches')
  } else if (effCons >= thresholds.consecutiveDegraded) {
    push(1, 'consecutive_unhealthy_batches')
  }

  if (reasons.includes('invalid_metrics')) {
    maxSeverity = maxSev(maxSeverity, 1)
  }

  let status = statusFromSeverity(maxSeverity)
  const uniqueReasons = sortedUniqueReasons(reasons)
  if (uniqueReasons.length > 0 && status === 'healthy') {
    status = 'degraded'
  }

  let retryBackoffMs = 0
  if (status === 'unavailable') {
    retryBackoffMs = Math.min(thresholds.maxRetryBackoffMs, 20_000)
  } else if (status === 'degraded') {
    retryBackoffMs = Math.min(thresholds.maxRetryBackoffMs, 5_000)
  }

  const shouldReduceConcurrency = status !== 'healthy'
  const shouldPauseNewClaims =
    status === 'unavailable' ||
    (status === 'degraded' && effCons >= thresholds.pauseClaimsMinConsecutiveDegraded && (eff429 > 0 || effTo > 0))

  return {
    status,
    reasons: uniqueReasons,
    retryBackoffMs,
    shouldReduceConcurrency,
    shouldPauseNewClaims,
  }
}
