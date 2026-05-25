import { describe, expect, it } from 'vitest'
import { mergeEsnetDetailIntoListing } from '@/lib/ingestion/estatesalesnet/mergeEsnetDetailIntoListing'
import type { EsnetDetailParsed } from '@/lib/ingestion/estatesalesnet/parseEsnetNgrxDetailHtml'

describe('mergeEsnetDetailIntoListing', () => {
  it('prefers detail gallery and keeps list address when detail is gated', () => {
    const listSeed = {
      title: 'List Title',
      description: null,
      addressRaw: '1200 Bardstown Rd',
      city: 'Louisville',
      state: 'KY',
      startDate: '2026-05-28',
      endDate: '2026-05-28',
      sourceUrl: 'https://www.estatesales.net/KY/Louisville/40222/4913946',
      imageSourceUrl: 'https://picturescdn.estatesales.net/4913946/1.jpg',
      rawPayload: {
        sourcePlatform: 'estatesales_net',
        esnetSaleId: 4913946,
        externalId: '4913946',
      },
    }

    const detail: EsnetDetailParsed = {
      saleId: '4913946',
      title: 'ESTATE SALE',
      description: 'Full description',
      addressRaw: null,
      city: 'Louisville',
      state: 'KY',
      postalCode: '40222',
      startDate: '2026-05-28',
      endDate: '2026-05-31',
      imageUrls: [
        'https://picturescdn.estatesales.net/4913946/1-1/a.jpg',
        'https://picturescdn.estatesales.net/4913946/1-1/b.jpg',
      ],
      utcShowAddressAfter: '2026-05-27T13:00:00Z',
      nativeLat: 38.28,
      nativeLng: -85.62,
    }

    const merged = mergeEsnetDetailIntoListing(listSeed, detail)
    expect(merged.title).toBe('ESTATE SALE')
    expect(merged.addressRaw).toBe('1200 Bardstown Rd')
    expect(merged.endDate).toBe('2026-05-31')
    expect(merged.rawPayload.detailPageParsed).toBe(true)
    expect(merged.rawPayload.imageUrls).toHaveLength(2)
  })
})
