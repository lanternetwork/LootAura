import { describe, expect, it } from 'vitest'
import {
  isYstmDetailListingUrl,
  isYstmIngestibleListingUrl,
  isYstmSalePhpIngestibleUrl,
} from '@/lib/ingestion/images/ystmDetailListingUrl'

describe('isYstmIngestibleListingUrl', () => {
  it('accepts listing.html and userlisting.html', () => {
    expect(
      isYstmIngestibleListingUrl(
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/123/listing.html'
      )
    ).toBe(true)
    expect(
      isYstmIngestibleListingUrl(
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/123/userlisting.html?s=tl'
      )
    ).toBe(true)
  })

  it('accepts supported sale.php patterns', () => {
    expect(
      isYstmIngestibleListingUrl(
        'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927'
      )
    ).toBe(true)
    const url = new URL('https://yardsaletreasuremap.com/sale.php?id=1&spreadsheet=abc')
    expect(isYstmSalePhpIngestibleUrl(url)).toBe(true)
  })

  it('rejects unsupported sale.php', () => {
    expect(isYstmIngestibleListingUrl('https://yardsaletreasuremap.com/sale.php')).toBe(false)
  })

  it('keeps isYstmDetailListingUrl narrow for image enrichment', () => {
    expect(isYstmDetailListingUrl('https://yardsaletreasuremap.com/US/Illinois/Chicago/1/listing.html')).toBe(
      true
    )
    expect(
      isYstmDetailListingUrl('https://yardsaletreasuremap.com/sale.php?communitysale=1&id=2')
    ).toBe(false)
  })
})
