import { describe, expect, it, vi } from 'vitest'
import { buildYstmGraphEnumerationMetrics } from '@/lib/admin/ystmGraphEnumerationMetrics'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: mockFromBase,
}))

vi.mock('@/lib/admin/ystmSourceExpansionMetrics', () => ({
  buildYstmSourceExpansionMetrics: vi.fn().mockResolvedValue({
    crawlableConfigs: 12,
    configsWithoutSourcePages: 34,
  }),
}))

function thenableQuery(result: { data?: unknown; error?: unknown }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'limit']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe('buildYstmGraphEnumerationMetrics', () => {
  it('parses last discovery orchestration run from notes', async () => {
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_source_page_candidates') {
        return thenableQuery({
          data: [
            { state: 'TX', validation_status: 'validated', promoted_at: '2026-05-21T00:00:00Z' },
            { state: 'CA', validation_status: 'fetch_failed', promoted_at: null },
          ],
        })
      }
      if (table === 'ingestion_orchestration_runs') {
        return thenableQuery({
          data: [
            {
              created_at: '2026-05-21T08:00:00Z',
              duration_ms: 45000,
              notes: {
                discovery_cron: {
                  ok: true,
                  skipped: false,
                  skipReason: null,
                  degraded: false,
                  statesScanned: 10,
                  catalogSize: 51,
                  graphEnumerationSkippedReason: null,
                  graphEnumerationThrottled: false,
                  phasesCompleted: ['graph_enumeration', 'promote'],
                  configsPromoted: 5,
                  configsRepaired: 1,
                  configsRevalidated: 3,
                  configsFailed: 0,
                  crawlableConfigCount: 80,
                  failedConfigCount: 2,
                  crawlExcludedConfigCount: 1,
                  candidatePagesDiscovered: 120,
                  candidatePagesValid: 90,
                },
              },
            },
          ],
        })
      }
      return thenableQuery({ data: [] })
    })

    const metrics = await buildYstmGraphEnumerationMetrics({} as never, Date.parse('2026-05-21T12:00:00Z'))

    expect(metrics.statesWithCandidates).toBe(2)
    expect(metrics.statesRemaining).toBeGreaterThan(0)
    expect(metrics.invalidPagesByStatus.fetch_failed).toBe(1)
    expect(metrics.configsPromotedLastRun).toBe(5)
    expect(metrics.lastDiscoveryRun).toMatchObject({
      ok: true,
      skipped: false,
      statesScanned: 10,
      catalogSize: 51,
      discoveryLatencyMs: 45000,
      configsPromoted: 5,
      phasesCompleted: ['graph_enumeration', 'promote'],
      graphEnumerationSkippedReason: null,
    })
  })
})
