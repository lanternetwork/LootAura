import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEsnetNgrxListHtml } from '@/lib/ingestion/estatesalesnet/parseEsnetNgrxListHtml'

describe('parseEsnetNgrxListHtml', () => {
  it('parses saleRows from estatesales-net-state script', () => {
    const rawHtml = readFileSync(
      join(
        process.cwd(),
        'tests/fixtures/parsers/estate_sales_net/ngrx_metro_louisville/raw.html'
      ),
      'utf8'
    )
    const result = parseEsnetNgrxListHtml(
      rawHtml,
      {
        city: 'Louisville',
        state: 'KY',
        source_platform: 'estatesales_net',
        source_pages: ['https://www.estatesales.net/KY/Louisville'],
      },
      'https://www.estatesales.net/KY/Louisville'
    )

    expect(result.invalid).toBe(0)
    expect(result.listings).toHaveLength(2)
    const withAddress = result.listings.find((l) => l.rawPayload.esnetSaleId === 4913946)
    expect(withAddress?.sourceUrl).toBe('https://www.estatesales.net/KY/Louisville/40222/4913946')
    expect(withAddress?.addressRaw).toBe('1200 Bardstown Rd')

    const gated = result.listings.find((l) => l.rawPayload.esnetSaleId === 4926588)
    expect(gated?.addressRaw).toBeNull()
    expect(gated?.rawPayload.utcShowAddressAfter).toBe('2026-05-28T13:00:00.000Z')
  })
})
