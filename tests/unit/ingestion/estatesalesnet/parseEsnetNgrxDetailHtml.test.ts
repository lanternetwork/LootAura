import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEsnetNgrxDetailHtml } from '@/lib/ingestion/estatesalesnet/parseEsnetNgrxDetailHtml'

describe('parseEsnetNgrxDetailHtml', () => {
  it('parses entitiesById from detail page NGRX state', () => {
    const rawHtml = readFileSync(
      join(process.cwd(), 'tests/fixtures/parsers/estate_sales_net/ngrx_detail_louisville/raw.html'),
      'utf8'
    )
    const sourceUrl = 'https://www.estatesales.net/KY/Louisville/40222/4913946'
    const parsed = parseEsnetNgrxDetailHtml(
      rawHtml,
      sourceUrl,
      { city: 'Louisville', state: 'KY', source_platform: 'estatesales_net', source_pages: [] }
    )

    expect(parsed?.saleId).toBe('4913946')
    expect(parsed?.title).toBe('ESTATE SALE')
    expect(parsed?.description).toContain('May 28th')
    expect(parsed?.startDate).toBe('2026-05-28')
    expect(parsed?.endDate).toBe('2026-05-31')
    expect(parsed?.imageUrls).toHaveLength(2)
    expect(parsed?.nativeLat).toBeCloseTo(38.277963)
    expect(parsed?.utcShowAddressAfter).toBe('2026-05-27T13:00:00Z')
  })
})
