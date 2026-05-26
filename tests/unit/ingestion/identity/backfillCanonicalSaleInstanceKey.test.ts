import { describe, expect, it, vi } from 'vitest'

const { mockFromBase } = vi.hoisted(() => ({
  mockFromBase: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (_e: string, f: Record<string, unknown>) => ({ event: _e, ...f }),
  emitObservabilityRecord: vi.fn(),
}))

import { runBackfillCanonicalSaleInstanceKey } from '@/lib/ingestion/identity/backfillCanonicalSaleInstanceKey'

function mockSelectBuilder(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'is', 'eq', 'not', 'order', 'limit', 'gt']) {
    q[m] = () => q
  }
  q.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(onFulfilled)
  return q
}

describe('runBackfillCanonicalSaleInstanceKey eligibility', () => {
  it('backfills canonical key for external_page_source rows without requiring YSTM detail URL', async () => {
    const admin: any = {}
    const updated: Array<{ id: string; canonical_sale_instance_key: string }> = []

    const fromBase = (_admin: unknown, table: string) => {
      if (table !== 'ingested_sales') throw new Error(`unexpected table ${table}`)
      return {
        ...mockSelectBuilder([
          {
            id: 'row-1',
            source_url: 'https://example.com/not-ystm',
            source_platform: 'external_page_source',
            state: 'CA',
            city: 'Los Angeles',
            normalized_address: '123 main st, los angeles, ca',
            date_start: '2026-05-26',
            date_end: '2026-05-26',
            time_start: null,
            time_end: null,
            title: 'Sale',
            description: null,
            lat: 34.05,
            lng: -118.24,
            raw_payload: {},
            source_schedule_hash: null,
            source_location_hash: null,
          },
        ]),
        update: (payload: { canonical_sale_instance_key: string }) => ({
          eq: async (_k: string, id: string) => {
            updated.push({ id, canonical_sale_instance_key: payload.canonical_sale_instance_key })
            return { error: null }
          },
        }),
      }
    }
    mockFromBase.mockImplementation(fromBase)

    const result = await runBackfillCanonicalSaleInstanceKey({
      admin,
      batchSize: 1,
      maxRows: 1,
      dryRun: false,
    })

    expect(result.rowsBackfilled).toBe(1)
    expect(updated).toHaveLength(1)
    expect(updated[0]!.canonical_sale_instance_key).toMatch(/^[a-f0-9]{64}$/)
  })
})

