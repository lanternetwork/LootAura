import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertSingle = vi.fn()
const insertSelect = vi.fn(() => ({ single: insertSingle }))
const insert = vi.fn(() => ({ select: insertSelect }))
const fromBaseMock = vi.fn((_db: unknown, _table: string) => ({ insert }))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (db: unknown, table: string) => fromBaseMock(db, table),
}))

describe('createPublishedSale image handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertSingle.mockResolvedValue({ data: { id: 'sale-1' }, error: null })
  })

  it('publishes using external HTTPS image URLs', async () => {
    const { createPublishedSale } = await import('@/lib/ingestion/publish')
    await createPublishedSale({
      id: '11111111-1111-4111-8111-111111111111',
      source_platform: 'external_page_source',
      source_url: 'https://example.com/listing/1',
      title: 'Sale',
      description: 'Desc',
      normalized_address: '1 Main St',
      city: 'Chicago',
      state: 'IL',
      zip_code: '60601',
      lat: 41.8,
      lng: -87.6,
      date_start: '2026-05-06',
      date_end: null,
      time_start: '09:00:00',
      time_end: null,
      image_cloudinary_url: null,
      image_urls: ['https://images.example.org/a.jpg', 'https://cdn.example.org/b.jpg'],
    })

    expect(insert).toHaveBeenCalled()
    const firstCall = insert.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    const payload = (firstCall as unknown[])[0] as { cover_image_url: string | null; images: string[] }
    expect(payload.cover_image_url).toBe('https://images.example.org/a.jpg')
    expect(payload.images).toEqual(['https://images.example.org/a.jpg', 'https://cdn.example.org/b.jpg'])
  })

  it('publishes with empty images when none are valid/present', async () => {
    const { createPublishedSale } = await import('@/lib/ingestion/publish')
    await createPublishedSale({
      id: '22222222-2222-4222-8222-222222222222',
      source_platform: 'external_page_source',
      source_url: 'https://example.com/listing/2',
      title: 'Sale',
      description: null,
      normalized_address: '1 Main St',
      city: 'Chicago',
      state: 'IL',
      zip_code: null,
      lat: 41.8,
      lng: -87.6,
      date_start: '2026-05-06',
      date_end: null,
      time_start: '09:00:00',
      time_end: null,
      image_cloudinary_url: null,
      image_urls: [],
    })

    const firstCall = insert.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    const payload = (firstCall as unknown[])[0] as { cover_image_url: string | null; images: string[] }
    expect(payload.cover_image_url).toBeNull()
    expect(payload.images).toEqual([])
  })
})
