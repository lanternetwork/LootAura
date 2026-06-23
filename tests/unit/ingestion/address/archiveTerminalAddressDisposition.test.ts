import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mergeAddressEnrichmentDetails } from '@/lib/ingestion/address/addressEnrichmentFailureDetails'

const mockFromBase = vi.fn()
const mockGetAdminDb = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockGetAdminDb(),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

describe('archiveCooledTerminalAddressDisposition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAdminDb.mockReturnValue({})
  })

  it('archives cooled terminal-active rows', async () => {
    const oldEnteredAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    mockFromBase.mockImplementation((_admin: unknown, table: string) => {
      if (table !== 'ingested_sales') {
        throw new Error(`unexpected table ${table}`)
      }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'row-1',
                      failure_details: { address_enrichment: { terminalEnteredAt: oldEnteredAt } },
                      updated_at: oldEnteredAt,
                      address_status: 'address_terminal_active',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null }),
              }),
            }),
          }),
        }),
      }
    })

    const { archiveCooledTerminalAddressDisposition } = await import(
      '@/lib/ingestion/address/archiveTerminalAddressDisposition'
    )
    const summary = await archiveCooledTerminalAddressDisposition({ coolingDays: 7 })
    expect(summary.archived).toBe(1)
    expect(summary.scanned).toBe(1)
  })

  it('records terminalEnteredAt when entering terminal disposition', () => {
    const merged = mergeAddressEnrichmentDetails(null, {
      lastReason: 'max_attempts_exceeded',
      attemptCount: 5,
      recordTerminalEntry: true,
    })
    const section = merged.address_enrichment as Record<string, unknown>
    expect(typeof section.terminalEnteredAt).toBe('string')
  })
})
