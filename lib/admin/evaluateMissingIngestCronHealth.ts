export const MISSING_INGEST_CRASH_LOOP_STALE_MINUTES = 30 as const

export type MissingIngestCronHealthInput = {
  lastStartedAt: string | null
  lastCompletedAt: string | null
}

export type MissingIngestCronHealth = {
  lastStartedAt: string | null
  lastCompletedAt: string | null
  minutesSinceCompletion: number | null
  crashLoopDetected: boolean
  lastError: 'unavailable_log_only_v1'
  lastErrorSource: 'runtime_logs'
}

function parseOptionalMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function evaluateMissingIngestCronHealth(
  input: MissingIngestCronHealthInput,
  nowMs: number = Date.now()
): MissingIngestCronHealth {
  const startedMs = parseOptionalMs(input.lastStartedAt)
  const completedMs = parseOptionalMs(input.lastCompletedAt)

  const minutesSinceCompletion =
    completedMs != null && Number.isFinite(completedMs)
      ? Math.max(0, (nowMs - completedMs) / 60_000)
      : null

  const startedAfterCompleted =
    startedMs != null && (completedMs == null || startedMs > completedMs)

  const completionStale =
    completedMs == null ||
    (minutesSinceCompletion != null &&
      minutesSinceCompletion > MISSING_INGEST_CRASH_LOOP_STALE_MINUTES)

  const crashLoopDetected = startedAfterCompleted && completionStale

  return {
    lastStartedAt: input.lastStartedAt,
    lastCompletedAt: input.lastCompletedAt,
    minutesSinceCompletion:
      minutesSinceCompletion != null
        ? Math.round(minutesSinceCompletion * 10) / 10
        : null,
    crashLoopDetected,
    lastError: 'unavailable_log_only_v1',
    lastErrorSource: 'runtime_logs',
  }
}
