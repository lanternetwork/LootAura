import { describe, it, expect, vi, beforeEach } from 'vitest'

const { adminMock, fromBaseMock, fetchPublishedMetroInventoryForSnapshotMock } = vi.hoisted(() => ({
  adminMock: {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>,
  fromBaseMock: vi.fn(),
  fetchPublishedMetroInventoryForSnapshotMock: vi.fn(),
}))

vi.mock('@/lib/seo/sitemap/fetchPublishedListingRows', () => ({
  fetchPublishedMetroInventoryForSnapshot: (...args: unknown[]) =>
    fetchPublishedMetroInventoryForSnapshotMock(...args),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => adminMock,
  fromBase: (...args: unknown[]) => fromBaseMock(...args),
}))

const STALE_SALE_UPDATED_AT = '2020-01-01T00:00:00.000Z'

const sampleBuildRow = {
  metro_slug: 'chicago-il',
  sale_id: 'sale-1',
  canonical_url: 'https://lootaura.app/sales/sale-1',
  title: 'Garage Sale',
  city: 'Chicago',
  state: 'IL',
  starts_at: '2026-06-20',
  ends_at: '2026-06-21',
  latitude: 41.88,
  longitude: -87.63,
  updated_at: STALE_SALE_UPDATED_AT,
  cover_image_url: null,
  address: '123 Main St',
}

function mockInventoryTable(insertSpy: ReturnType<typeof vi.fn>) {
  fromBaseMock.mockImplementation((_admin: unknown, table: string) => {
    if (table !== 'seo_metro_inventory') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return {
      delete: vi.fn(() => ({
        neq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      insert: insertSpy,
    }
  })
}

describe('buildSeoMetroInventorySnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchPublishedMetroInventoryForSnapshotMock.mockResolvedValue([sampleBuildRow])
  })

  it('persists snapshot refresh time in updated_at, not sale source updated_at', async () => {
    const insertSpy = vi.fn(() => Promise.resolve({ error: null }))
    mockInventoryTable(insertSpy)
    const cronNow = new Date('2026-06-28T03:00:00.000Z')

    const { buildSeoMetroInventorySnapshot } = await import(
      '@/lib/seo/snapshots/buildSeoMetroInventorySnapshot'
    )
    const result = await buildSeoMetroInventorySnapshot(adminMock, cronNow)

    expect(result.rowCount).toBe(1)
    expect(result.updatedAt).toBe('2026-06-28T03:00:00.000Z')
    expect(insertSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        metro_slug: 'chicago-il',
        sale_id: 'sale-1',
        updated_at: '2026-06-28T03:00:00.000Z',
      }),
    ])
  })

  it('advances snapshot freshness on repeated rebuilds even when sale rows are unchanged', async () => {
    const insertedPayloads: Array<Array<{ updated_at: string }>> = []
    const insertSpy = vi.fn((payload: Array<{ updated_at: string }>) => {
      insertedPayloads.push(payload)
      return Promise.resolve({ error: null })
    })
    mockInventoryTable(insertSpy)

    const { buildSeoMetroInventorySnapshot } = await import(
      '@/lib/seo/snapshots/buildSeoMetroInventorySnapshot'
    )

    const firstRun = new Date('2026-06-28T03:00:00.000Z')
    const secondRun = new Date('2026-06-28T04:00:00.000Z')

    await buildSeoMetroInventorySnapshot(adminMock, firstRun)
    await buildSeoMetroInventorySnapshot(adminMock, secondRun)

    expect(insertedPayloads).toHaveLength(2)
    expect(insertedPayloads[0]?.[0]?.updated_at).toBe('2026-06-28T03:00:00.000Z')
    expect(insertedPayloads[1]?.[0]?.updated_at).toBe('2026-06-28T04:00:00.000Z')
    expect(insertedPayloads[1]?.[0]?.updated_at).not.toBe(insertedPayloads[0]?.[0]?.updated_at)
  })
})
