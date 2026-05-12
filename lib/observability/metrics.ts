/**
 * Dependency-free timing and classification helpers for observability payloads.
 */

export type RetryExhaustionClass = 'none' | 'approaching' | 'exhausted' | 'unknown'

export type QueuePressureClass = 'normal' | 'elevated' | 'high' | 'critical' | 'unknown'

export function elapsedMsSince(sinceMs: number): number {
  return Math.max(0, Date.now() - sinceMs)
}

/** Age in ms from an ISO timestamp (e.g. lease `updated_at`). Returns null if invalid. */
export function staleAgeMsFromIso(iso: string | null | undefined): number | null {
  if (iso == null || typeof iso !== 'string' || iso.trim() === '') return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Date.now() - t)
}

/**
 * Classify retry exhaustion from attempt counts (generic; worker-specific max can be passed).
 */
export function classifyRetryExhaustion(attempts: number, maxAttempts: number): RetryExhaustionClass {
  if (!Number.isFinite(attempts) || !Number.isFinite(maxAttempts) || maxAttempts <= 0) return 'unknown'
  if (attempts >= maxAttempts) return 'exhausted'
  if (attempts >= Math.max(1, maxAttempts - 1)) return 'approaching'
  return 'none'
}

/**
 * Queue pressure from depth vs high watermark (caller supplies thresholds from env or constants).
 */
export function classifyQueuePressure(depth: number, highWatermark: number, criticalMultiplier = 2): QueuePressureClass {
  if (!Number.isFinite(depth) || !Number.isFinite(highWatermark) || highWatermark <= 0) return 'unknown'
  if (depth >= highWatermark * criticalMultiplier) return 'critical'
  if (depth >= highWatermark) return 'high'
  if (depth >= Math.max(1, Math.floor(highWatermark * 0.5))) return 'elevated'
  return 'normal'
}

export type DurationTimer = { readonly startedAtMs: number; elapsedMs: () => number }

export function createDurationTimer(startedAtMs: number = Date.now()): DurationTimer {
  const start = startedAtMs
  return {
    startedAtMs: start,
    elapsedMs: () => elapsedMsSince(start),
  }
}
