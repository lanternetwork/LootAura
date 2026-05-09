import { beforeEach, describe, expect, it, vi } from 'vitest'

const fromBaseMock = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => fromBaseMock(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('runIngestedSalesRepair address gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not update sales.address when normalized line fails publish validation', async () => {
    const dupSuffixAddr =
      'Unknown address, Chicago, IL, Chicago, IL, Chicago, IL'
    fromBaseMock.mockImplementation((_db: unknown, table: string) => {
      if (table === 'sales') {
        return {
          select: () => ({
            not: () => ({
              limit: async () => ({
                data: [
                  {
                    id: 'sale-1',
                    ingested_sale_id: 'ing-1',
                    description: 'ok',
                    address: dupSuffixAddr,
                    city: 'Chicago',
                    state: 'IL',
                    ingested: {
                      id: 'ing-1',
                      description: 'ok',
                      raw_text: 'ok',
                      city: 'Chicago',
                      state: 'IL',
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const { runIngestedSalesRepair } = await import('@/lib/ingestion/ingestedSalesRepair')
    const result = await runIngestedSalesRepair({ dryRun: false, limit: 10 })

    expect(result.repaired.salesAddress).toBe(0)
    expect(result.writes).toBe(0)
    expect(fromBaseMock.mock.calls.every((c) => c[1] === 'sales')).toBe(true)
  })
})
