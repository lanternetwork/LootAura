import type { MissingIngestCronHealth } from '@/lib/admin/evaluateMissingIngestCronHealth'

function bullet(label: string, value: string | number | boolean): string {
  const formatted =
    typeof value === 'number'
      ? value.toLocaleString('en-US')
      : typeof value === 'boolean'
        ? value
          ? 'true'
          : 'false'
        : value
  return `- ${label}: ${formatted}`
}

export function buildMissingIngestCronHealthDiagnostics(
  health: MissingIngestCronHealth
): string {
  const lines = [
    '### YSTM_MISSING_INGEST_HEALTH',
    bullet('last_started_at', health.lastStartedAt ?? '—'),
    bullet('last_completed_at', health.lastCompletedAt ?? '—'),
    bullet(
      'minutes_since_completion',
      health.minutesSinceCompletion != null ? health.minutesSinceCompletion : '—'
    ),
    bullet('crash_loop_detected', health.crashLoopDetected),
    bullet('last_error', health.lastError),
    bullet('last_error_source', health.lastErrorSource),
  ]
  return lines.join('\n')
}
