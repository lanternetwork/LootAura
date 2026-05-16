import { describe, it, expect, vi } from 'vitest'
import { runArchiveEndedSalesJob } from '@/lib/sales/archiveEndedSalesSqlBatch'
import { ObservabilityEvents } from '@/lib/observability/events'

vi.mock('@/lib/observability/emit', () => ({
  shouldEmitTelemetryJson: vi.fn(() => false),
  buildTelemetryRecord: (event: string, fields: Record<string, unknown>) => ({ event, ...fields }),
  emitObservabilityRecord: vi.fn(),
}))

describe('runArchiveEndedSalesJob telemetry wiring', () => {
  it('completes with telemetryContext without throwing', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'count_sales_pending_archive') {
        return {
          data: {
            today_utc_date: '2025-01-15',
            pending_via_ends_at: 0,
            pending_via_legacy: 0,
            published_past_ends_at: 0,
            active_past_ends_at: 0,
            suspicious_ends_before_starts: 0,
          },
          error: null,
        }
      }
      if (name === 'archive_sales_ended_batch') {
        return { data: [{ archived_via_ends_at: 0, archived_via_legacy: 0 }], error: null }
      }
      return { data: null, error: null }
    })
    const admin = { rpc } as any
    const res = await runArchiveEndedSalesJob({
      admin,
      now: new Date('2025-01-15T12:00:00.000Z'),
      logBase: { task: 'unit-test' },
      telemetryContext: { requestId: 'r1', operationId: 'o1', correlationId: 'c1' },
    })
    expect(res.ok).toBe(true)
    expect(res.archived).toBe(0)
    const { emitObservabilityRecord } = await import('@/lib/observability/emit')
    expect(vi.mocked(emitObservabilityRecord).mock.calls.length).toBeGreaterThan(0)
    const events = vi.mocked(emitObservabilityRecord).mock.calls.map((c) => (c[0] as { event: string }).event)
    expect(events).toContain(ObservabilityEvents.archive.jobSummary)
  })
})
