import { describe, expect, it } from 'vitest'
import {
  INGESTION_CORE_METRICS_POLL_MS,
  INGESTION_DIAGNOSTICS_POLL_MS,
} from '@/lib/admin/ingestionDashboardPolling'

describe('ingestionDashboardPolling', () => {
  it('core metrics poll is at most once per minute', () => {
    expect(INGESTION_CORE_METRICS_POLL_MS).toBeGreaterThanOrEqual(60_000)
  })

  it('diagnostics poll is slower than core metrics', () => {
    expect(INGESTION_DIAGNOSTICS_POLL_MS).toBeGreaterThan(INGESTION_CORE_METRICS_POLL_MS)
  })
})
