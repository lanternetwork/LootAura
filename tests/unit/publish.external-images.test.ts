import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InsufficientAddressForPublishError } from '@/lib/ingestion/publishValidation'
import { minimalValidProbeFetchResponse } from '../helpers/minimalProbeImage'

const { dnsLookup, resolvePersistableSaleEndsAtMock } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  resolvePersistableSaleEndsAtMock: vi.fn().mockResolvedValue({
    ends_at: '2099-06-15T04:00:00.000Z',
    listing_timezone: 'America/Chicago',
  }),
}))

vi.mock('@/lib/sales/resolvePersistableSaleEndsAt', () => ({
  resolvePersistableSaleEndsAt: (...args: unknown[]) => resolvePersistableSaleEndsAtMock(...args),
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

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
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    insertSingle.mockResolvedValue({ data: { id: 'sale-1' }, error: null })
    resolvePersistableSaleEndsAtMock.mockResolvedValue({
      ends_at: '2099-06-15T04:00:00.000Z',
      listing_timezone: 'America/Chicago',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    const payload = (firstCall as unknown[])[0] as {
      cover_image_url: string | null
      images: string[]
      ends_at: string | null
      listing_timezone: string | null
    }
    expect(payload.cover_image_url).toBe('https://images.example.org/a.jpg')
    expect(payload.images).toEqual(['https://images.example.org/a.jpg', 'https://cdn.example.org/b.jpg'])
    expect(payload.ends_at).toBe('2099-06-15T04:00:00.000Z')
    expect(payload.listing_timezone).toBe('America/Chicago')
  })

  it('rejects branding image_cloudinary_url via sanitizer (no raw fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new ArrayBuffer(0), { status: 206 }))
    )
    const { createPublishedSale } = await import('@/lib/ingestion/publish')
    const { mergeSanitizedCloudinaryIntoPublishable } = await import(
      '@/lib/ingestion/sanitizePublishCloudinaryFallback'
    )
    const body = {
      id: '66666666-6666-4666-8666-666666666666',
      source_platform: 'external_page_source',
      source_url: 'https://example.com/listing/cloud-brand',
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
      image_cloudinary_url: 'https://res.cloudinary.com/acct/image/upload/v1/ystm/hero.png',
      image_urls: [] as string[],
    }
    await mergeSanitizedCloudinaryIntoPublishable(body)
    await createPublishedSale(body)

    const firstCall = insert.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    const payload = (firstCall as unknown[])[0] as { cover_image_url: string | null; images: string[] }
    expect(payload.cover_image_url).toBeNull()
    expect(payload.images).toEqual([])
  })

  it('accepts image_cloudinary_url when sanitizer allows the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => minimalValidProbeFetchResponse()))
    const { createPublishedSale } = await import('@/lib/ingestion/publish')
    const { mergeSanitizedCloudinaryIntoPublishable } = await import(
      '@/lib/ingestion/sanitizePublishCloudinaryFallback'
    )
    const okUrl = 'https://res.cloudinary.com/acct/image/upload/v1/listing/yard-photo.jpg'
    const body = {
      id: '77777777-7777-4777-8777-777777777777',
      source_platform: 'external_page_source',
      source_url: 'https://example.com/listing/cloud-ok',
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
      image_cloudinary_url: okUrl,
      image_urls: [] as string[],
    }
    await mergeSanitizedCloudinaryIntoPublishable(body)
    await createPublishedSale(body)

    const firstCall = insert.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    const payload = (firstCall as unknown[])[0] as { cover_image_url: string | null; images: string[] }
    expect(payload.cover_image_url).toBe(okUrl)
    expect(payload.images).toEqual([okUrl])
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

  it('applies display-only title case to published address after validation', async () => {
    const { createPublishedSale } = await import('@/lib/ingestion/publish')
    await createPublishedSale({
      id: '44444444-4444-4444-8444-444444444444',
      source_platform: 'external_page_source',
      source_url: 'https://example.com/listing/cased',
      title: 'Sale',
      description: null,
      normalized_address: '123 main st',
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
      image_urls: [],
    })

    const firstCall = insert.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    const payload = (firstCall as unknown[])[0] as { address: string }
    expect(payload.address).toBe('123 Main St, Chicago, IL')
  })

  it('does not insert when address is an unresolved placeholder', async () => {
    const { createPublishedSale } = await import('@/lib/ingestion/publish')
    await expect(
      createPublishedSale({
        id: '33333333-3333-4333-8333-333333333333',
        source_platform: 'external_page_source',
        source_url: 'https://example.com/listing/bad-addr',
        title: 'Sale',
        description: null,
        normalized_address: 'Unknown address',
        city: 'Munster',
        state: 'IN',
        zip_code: '46321',
        lat: 41.56,
        lng: -87.51,
        date_start: '2026-05-06',
        date_end: null,
        time_start: '09:00:00',
        time_end: null,
        image_cloudinary_url: null,
        image_urls: [],
      })
    ).rejects.toThrow(InsufficientAddressForPublishError)

    expect(insert).not.toHaveBeenCalled()
  })
})
