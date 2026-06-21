import type { MissingIngestCronHealth } from '@/lib/admin/evaluateMissingIngestCronHealth'

export function minimalMissingIngestCronHealth(
  overrides: Partial<MissingIngestCronHealth> = {}
): MissingIngestCronHealth {
  return {
    lastStartedAt: null,
    lastCompletedAt: null,
    minutesSinceCompletion: null,
    crashLoopDetected: false,
    lastError: 'unavailable_log_only_v1',
    lastErrorSource: 'runtime_logs',
    ...overrides,
  }
}
