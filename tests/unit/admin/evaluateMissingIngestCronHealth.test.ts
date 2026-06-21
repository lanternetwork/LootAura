import { describe, expect, it } from 'vitest'
import {
  evaluateMissingIngestCronHealth,
  MISSING_INGEST_CRASH_LOOP_STALE_MINUTES,
} from '@/lib/admin/evaluateMissingIngestCronHealth'
import { buildMissingIngestCronHealthDiagnostics } from '@/lib/admin/buildMissingIngestCronHealthDiagnostics'

const NOW = Date.parse('2026-06-21T03:00:00.000Z')

describe('evaluateMissingIngestCronHealth', () => {
  it('detects crash loop when started after completion and completion is stale', () => {
    const health = evaluateMissingIngestCronHealth(
      {
        lastStartedAt: '2026-06-21T02:01:23.129+00:00',
        lastCompletedAt: '2026-06-20T18:15:41.276+00:00',
      },
      NOW
    )

    expect(health.crashLoopDetected).toBe(true)
    expect(health.minutesSinceCompletion).toBeGreaterThan(MISSING_INGEST_CRASH_LOOP_STALE_MINUTES)
    expect(health.lastError).toBe('unavailable_log_only_v1')
    expect(health.lastErrorSource).toBe('runtime_logs')
  })

  it('does not detect crash loop when completion is current', () => {
    const health = evaluateMissingIngestCronHealth(
      {
        lastStartedAt: '2026-06-21T02:59:00.000Z',
        lastCompletedAt: '2026-06-21T02:59:30.000Z',
      },
      NOW
    )

    expect(health.crashLoopDetected).toBe(false)
    expect(health.minutesSinceCompletion).toBeLessThan(1)
  })

  it('does not detect crash loop when completion is recent despite started after completed', () => {
    const health = evaluateMissingIngestCronHealth(
      {
        lastStartedAt: '2026-06-21T02:50:00.000Z',
        lastCompletedAt: '2026-06-21T02:40:00.000Z',
      },
      NOW
    )

    expect(health.crashLoopDetected).toBe(false)
    expect(health.minutesSinceCompletion).toBe(20)
  })
})

describe('buildMissingIngestCronHealthDiagnostics', () => {
  it('renders YSTM_MISSING_INGEST_HEALTH section', () => {
    const md = buildMissingIngestCronHealthDiagnostics(
      evaluateMissingIngestCronHealth(
        {
          lastStartedAt: '2026-06-21T02:01:23.129+00:00',
          lastCompletedAt: '2026-06-20T18:15:41.276+00:00',
        },
        NOW
      )
    )

    expect(md).toContain('### YSTM_MISSING_INGEST_HEALTH')
    expect(md).toContain('crash_loop_detected: true')
    expect(md).toContain('last_error: unavailable_log_only_v1')
    expect(md).toContain('last_error_source: runtime_logs')
  })
})
