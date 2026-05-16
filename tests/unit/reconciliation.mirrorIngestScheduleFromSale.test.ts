import { describe, expect, it, vi, beforeEach } from 'vitest'

const mirrorCtx = vi.hoisted(() => ({
  ingestedPayloads: [] as unknown[],
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: vi.fn((_admin: unknown, table: string) => {
    if (table === 'sales') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                date_start: '2026-06-01',
                date_end: '2026-06-01',
                time_start: '09:00:00',
                time_end: '15:00:00',
                listing_timezone: 'America/Chicago',
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'ingested_sales') {
      return {
        update: (payload: unknown) => {
          mirrorCtx.ingestedPayloads.push(payload)
          return {
            eq: async () => ({ error: null }),
          }
        },
      }
    }
    return {}
  }),
}))

import { mirrorIngestScheduleFieldsFromPublishedSalePhase2A } from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'

describe('mirrorIngestScheduleFieldsFromPublishedSalePhase2A', () => {
  beforeEach(() => {
    mirrorCtx.ingestedPayloads.length = 0
    vi.clearAllMocks()
  })

  it('mirrors sale schedule columns and merged listing_timezone onto ingested_sales', async () => {
    const ok = await mirrorIngestScheduleFieldsFromPublishedSalePhase2A({} as never, {
      ingestedSaleId: 'ing-1',
      saleId: 'sale-1',
      currentRawPayload: { existing: true },
    })
    expect(ok).toBe(true)
    expect(mirrorCtx.ingestedPayloads).toHaveLength(1)
    expect(mirrorCtx.ingestedPayloads[0]).toEqual({
      date_start: '2026-06-01',
      date_end: '2026-06-01',
      time_start: '09:00:00',
      time_end: '15:00:00',
      raw_payload: { existing: true, listing_timezone: 'America/Chicago' },
    })
  })
})
