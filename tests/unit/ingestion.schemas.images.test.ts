import { describe, expect, it } from 'vitest'
import { PublishInputSchema } from '@/lib/ingestion/schemas'

const base = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  title: 'Sale',
  description: null,
  address: '1 Main St',
  city: 'Chicago',
  state: 'IL',
  zipCode: null,
  lat: 41.8,
  lng: -87.6,
  dateStart: '2026-05-06',
  dateEnd: null,
  timeStart: '09:00:00',
  timeEnd: null,
  importSource: 'external_page_source',
  externalSourceUrl: 'https://example.com/listing/1',
  ingestedSaleId: '22222222-2222-4222-8222-222222222222',
}

describe('PublishInputSchema image URL validation', () => {
  it('accepts external HTTPS image URLs', () => {
    const parsed = PublishInputSchema.parse({
      ...base,
      coverImageUrl: 'https://images.example.org/cover.jpg',
      images: ['https://images.example.org/cover.jpg', 'https://cdn.example.org/other.jpg'],
    })
    expect(parsed.coverImageUrl).toBe('https://images.example.org/cover.jpg')
  })

  it('rejects non-HTTPS image URLs', () => {
    expect(() =>
      PublishInputSchema.parse({
        ...base,
        coverImageUrl: 'http://images.example.org/cover.jpg',
        images: ['http://images.example.org/cover.jpg'],
      })
    ).toThrow()
  })
})
