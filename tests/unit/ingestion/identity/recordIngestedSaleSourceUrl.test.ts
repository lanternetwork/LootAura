import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

vi.mock('@/lib/log', () => ({
  logger: { warn: vi.fn() },
}))

function selectChain(result: { data?: unknown; error?: { message: string } | null }) {
  const q: Record<string, unknown> = {}
  q.eq = vi.fn(() => q)
  q.maybeSingle = vi.fn(async () => result)
  return q
}

describe('recordIngestedSaleSourceUrl', () => {
  beforeEach(() => {
    mockFromBase.mockReset()
  })

  it('inserts a new alias row when none exists', async () => {
    const insert = vi.fn((_row: Record<string, unknown>) => ({ error: null }))
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ingested_sale_source_urls') {
        return {
          select: () => selectChain({ data: null, error: null }),
          insert,
        }
      }
      return selectChain({ data: null, error: null })
    })

    const { recordIngestedSaleSourceUrl } = await import(
      '@/lib/ingestion/identity/recordIngestedSaleSourceUrl'
    )
    await recordIngestedSaleSourceUrl({} as never, {
      ingestedSaleId: 'sale-1',
      sourcePlatform: 'external_page_source',
      sourceUrl:
        'https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html/961002738/listing.html',
    })

    expect(insert).toHaveBeenCalled()
    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row.ingested_sale_id).toBe('sale-1')
    expect(String(row.canonical_source_url)).toContain('961002738')
    expect(row.source_listing_id).toBe('961002738')
  })

  it('updates last_seen when alias already exists', async () => {
    const update = vi.fn((_patch: Record<string, unknown>) => ({
      eq: vi.fn(() => ({ error: null })),
    }))
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ingested_sale_source_urls') {
        return {
          select: () => selectChain({ data: { id: 'alias-1' }, error: null }),
          update,
        }
      }
      return selectChain({ data: null, error: null })
    })

    const { recordIngestedSaleSourceUrl } = await import(
      '@/lib/ingestion/identity/recordIngestedSaleSourceUrl'
    )
    await recordIngestedSaleSourceUrl({} as never, {
      ingestedSaleId: 'sale-1',
      sourcePlatform: 'external_page_source',
      sourceUrl:
        'https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html/961002738/listing.html',
      seenAtIso: '2026-05-21T12:00:00.000Z',
    })

    expect(update).toHaveBeenCalled()
    const patch = update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(patch.last_seen_at).toBe('2026-05-21T12:00:00.000Z')
  })

  it('no-ops when required ids are missing', async () => {
    const { recordIngestedSaleSourceUrl } = await import(
      '@/lib/ingestion/identity/recordIngestedSaleSourceUrl'
    )
    await recordIngestedSaleSourceUrl({} as never, {
      ingestedSaleId: '',
      sourcePlatform: 'external_page_source',
      sourceUrl: 'https://example.com/listing.html',
    })
    expect(mockFromBase).not.toHaveBeenCalled()
  })
})
