import { describe, expect, it } from 'vitest'
import {
  extractLastZip5FromText,
  extractZip5ForIngestionContext,
  extractZip5FromListingUrlPath,
} from '@/lib/ingestion/extractZip5ForIngestion'

describe('extractZip5ForIngestion', () => {
  it('extracts the last ZIP5 from an address line', () => {
    expect(extractLastZip5FromText('1751 N Lafayette St, Griffith, IN 46319')).toBe('46319')
  })

  it('normalizes ZIP+4 to ZIP5 using the base segment', () => {
    expect(extractLastZip5FromText('PO Box 1, Griffith, IN 46319-1234')).toBe('46319')
  })

  it('reads a numeric path segment from a YSTM listing URL', () => {
    expect(
      extractZip5FromListingUrlPath(
        'https://www.yardsaletreasuremap.com/US/Illinois/La-Grange/60525/listing.html'
      )
    ).toBe('60525')
  })

  it('prefers address ZIP over URL path when both exist', () => {
    expect(
      extractZip5ForIngestionContext({
        resolvedAddressRaw: '123 Main St, Griffith, IN 46319',
        sourceUrl:
          'https://www.yardsaletreasuremap.com/US/Illinois/La-Grange/60525/listing.html',
      })
    ).toBe('46319')
  })
})
