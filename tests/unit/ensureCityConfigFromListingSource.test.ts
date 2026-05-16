import { describe, expect, it } from 'vitest'
import { deriveYardsaleTreasureMapCityPageUrl } from '@/lib/ingestion/ensureCityConfigFromListingSource'

describe('deriveYardsaleTreasureMapCityPageUrl', () => {
  it('returns city page URL when source is already a city .html page', () => {
    expect(
      deriveYardsaleTreasureMapCityPageUrl('https://yardsaletreasuremap.com/US/Illinois/Chicago.html')
    ).toBe('https://yardsaletreasuremap.com/US/Illinois/Chicago.html')
  })

  it('strips listing path to city page for www host', () => {
    expect(
      deriveYardsaleTreasureMapCityPageUrl(
        'https://www.yardsaletreasuremap.com/US/Illinois/La-Grange/60525/listing.html'
      )
    ).toBe('https://www.yardsaletreasuremap.com/US/Illinois/La-Grange.html')
  })

  it('returns null for non-YSTM host', () => {
    expect(deriveYardsaleTreasureMapCityPageUrl('https://evil.com/US/Illinois/Chicago.html')).toBeNull()
  })

  it('returns null for malformed URL', () => {
    expect(deriveYardsaleTreasureMapCityPageUrl('not-a-url')).toBeNull()
  })

  it('returns null when /US/ is missing', () => {
    expect(deriveYardsaleTreasureMapCityPageUrl('https://yardsaletreasuremap.com/Illinois/Chicago.html')).toBeNull()
  })
})
