import { describe, expect, it } from 'vitest'
import { getYstmPathMunicipalityPreview } from '@/lib/ingestion/ystmListingCityAuthority'

describe('getYstmPathMunicipalityPreview', () => {
  it('strips .html hub segment to Chicago (never Chicago.html)', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago.html/Lindenhurst/100-Main-St/1/listing.html'
    const p = getYstmPathMunicipalityPreview(href)
    expect(p.city).toBe('Lindenhurst')
    expect(p.state).toBe('IL')
  })

  it('Antioch path yields Antioch not Chicago.html', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Illinois/Antioch/200-Oak/99/listing.html'
    expect(getYstmPathMunicipalityPreview(href).city).toBe('Antioch')
  })

  it('Waukegan path yields Waukegan', () => {
    const href =
      'https://yardsaletreasuremap.com/US/Illinois/Waukegan/300-Elm/88/listing.html'
    expect(getYstmPathMunicipalityPreview(href).city).toBe('Waukegan')
  })
})
