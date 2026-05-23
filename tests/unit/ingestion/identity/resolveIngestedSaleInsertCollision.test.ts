import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveIngestedSaleInsertCollision } from '@/lib/ingestion/identity/resolveIngestedSaleInsertCollision'

const mockPromote = vi.fn()
const mockFindActiveByKey = vi.fn()
const mockUpdateExisting = vi.fn()
const mockFindPublished = vi.fn()

vi.mock('@/lib/ingestion/acquisition/promoteExistingIngestedSaleForDetailFirst', () => ({
  promoteExistingIngestedSaleForDetailFirst: (...args: unknown[]) => mockPromote(...args),
  findPublishedIngestedSaleIdForDetailFirst: (...args: unknown[]) => mockFindPublished(...args),
}))

vi.mock('@/lib/ingestion/identity/ingestedSaleSourceUrlLookup', () => ({
  findActiveIngestedSaleBySaleInstanceKey: (...args: unknown[]) => mockFindActiveByKey(...args),
}))

vi.mock('@/lib/ingestion/acquisition/updateExistingIngestedSaleForDetailFirst', () => ({
  updateExistingIngestedSaleForDetailFirst: (...args: unknown[]) => mockUpdateExisting(...args),
}))

const SOURCE_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/500-Elm/961002738/listing.html'

const ROW = {
  source_platform: 'external_page_source',
  source_url: SOURCE_URL,
  sale_instance_key: 'external_page_source:IL|chicago|500 elm:2026-07-01|open:961002738',
  date_start: '2026-07-01',
  date_end: null,
} as const

beforeEach(() => {
  vi.clearAllMocks()
  mockPromote.mockResolvedValue(null)
  mockFindPublished.mockResolvedValue(null)
})

describe('resolveIngestedSaleInsertCollision', () => {
  it('updates active row by sale_instance_key when URL promote misses (reused URL, new dates)', async () => {
    mockFindActiveByKey.mockResolvedValue({ id: 'ing-active' })
    mockUpdateExisting.mockResolvedValue({ id: 'ing-active' })

    const result = await resolveIngestedSaleInsertCollision({} as never, {
      sourceUrl: SOURCE_URL,
      row: ROW,
    })

    expect(mockPromote).toHaveBeenCalled()
    expect(mockFindActiveByKey).toHaveBeenCalledWith(
      {},
      'external_page_source',
      ROW.sale_instance_key
    )
    expect(mockUpdateExisting).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        ingestedSaleId: 'ing-active',
        reviveExpiredUrlReuse: true,
      })
    )
    expect(result).toEqual({ id: 'ing-active' })
  })

  it('returns URL promote result without instance-key lookup when promote succeeds', async () => {
    mockPromote.mockResolvedValue({ id: 'ing-url' })

    const result = await resolveIngestedSaleInsertCollision({} as never, {
      sourceUrl: SOURCE_URL,
      row: ROW,
    })

    expect(result).toEqual({ id: 'ing-url' })
    expect(mockFindActiveByKey).not.toHaveBeenCalled()
  })
})
