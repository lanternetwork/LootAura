import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processIngestedSale } from '@/lib/ingestion/processSale'
import type { CityIngestionConfig, RawExternalSale } from '@/lib/ingestion/types'

const config: CityIngestionConfig = {
  city: 'Homewood',
  state: 'IL',
  timezone: 'America/Chicago',
  enabled: true,
  sourcePlatform: 'external_page_source',
  sourcePages: [],
}

function raw(overrides: Partial<RawExternalSale> = {}): RawExternalSale {
  return {
    sourcePlatform: 'external_page_source',
    sourceUrl: 'https://example.test/listing.html',
    externalId: null,
    title: 'Sale',
    description: 'Sat 5/2\nStart time: 8am',
    addressRaw: '123 Main St',
    dateRaw: null,
    imageSourceUrl: null,
    rawPayload: {},
    cityHint: 'homewood',
    stateHint: 'il',
    ...overrides,
  }
}

describe('processIngestedSale — city/state normalization', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes lowercase city and abbrev state', async () => {
    const processed = await processIngestedSale(raw({ cityHint: 'orland park', stateHint: 'il' }), config)
    expect(processed.city).toBe('Orland Park')
    expect(processed.state).toBe('IL')
  })

  it('normalizes uppercase multi-word city', async () => {
    const processed = await processIngestedSale(raw({ cityHint: 'DOWNERS GROVE', stateHint: 'IN' }), config)
    expect(processed.city).toBe('Downers Grove')
    expect(processed.state).toBe('IN')
  })

  it('normalizes mixed-case city', async () => {
    const processed = await processIngestedSale(raw({ cityHint: 'oRlAnD pArK', stateHint: 'In' }), config)
    expect(processed.city).toBe('Orland Park')
    expect(processed.state).toBe('IN')
  })

  it('maps full state name from hint', async () => {
    const processed = await processIngestedSale(raw({ cityHint: 'Chicago', stateHint: 'Illinois' }), config)
    expect(processed.city).toBe('Chicago')
    expect(processed.state).toBe('IL')
  })

  it('normalizes city hints polluted by listing path fragments', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/100-Main-St/100/listing.html',
        cityHint: 'Chicago.html',
        stateHint: 'Illinois',
      }),
      config
    )
    expect(processed.city).toBe('Chicago')
    expect(processed.city).not.toBe('Chicago.html')
    expect(processed.state).toBe('IL')
  })

  it('prefers structured city/state from address over polluted hints', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/100-Main-St/100/listing.html',
        addressRaw: '8559 S Maryland Ave, Chicago, IL 60619',
        cityHint: 'Chicago.html',
        stateHint: 'Illinois',
      }),
      config
    )
    expect(processed.city).toBe('Chicago')
    expect(processed.city).not.toBe('Chicago.html')
    expect(processed.state).toBe('IL')
  })

  it('YSTM: concrete address tail wins over conflicting URL municipality', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl:
          'https://yardsaletreasuremap.com/US/Indiana/Fair-Oaks/100-Main-St/38730020/listing.html',
        addressRaw: '123 St, Munster, IN 46321',
        cityHint: 'Munster',
        stateHint: 'IN',
      }),
      config
    )
    expect(processed.city).toBe('Munster')
    expect(processed.state).toBe('IN')
  })

  it('YSTM hub path: concrete Chicago tail wins over conflicting Park City path slug', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl:
          'https://yardsaletreasuremap.com/US/Illinois/Chicago.html/Park-City/100-Main-St/38730021/listing.html',
        addressRaw: '1 Wacker Dr, Chicago, IL 60601',
        cityHint: 'Chicago',
        stateHint: 'IL',
      }),
      config
    )
    expect(processed.city).toBe('Chicago')
    expect(processed.state).toBe('IL')
  })

  it('YSTM: Orland Park path vs Palos Park in address tail uses Palos Park for concrete street', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl:
          'https://yardsaletreasuremap.com/US/Illinois/Orland-Park/123-Oak-St/900/listing.html',
        addressRaw: '123 Oak St, Palos Park, IL 60464',
        cityHint: 'Orland Park',
        stateHint: 'IL',
      }),
      config
    )
    expect(processed.city).toBe('Palos Park')
    expect(processed.state).toBe('IL')
  })

  it('YSTM: Midlothian path vs Palos Heights in address tail uses Palos Heights for concrete street', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl:
          'https://yardsaletreasuremap.com/US/Illinois/Midlothian/456-Elm-Ave/888/listing.html',
        addressRaw: '456 Elm Ave, Palos Heights, IL 60463',
        cityHint: 'Midlothian',
        stateHint: 'IL',
      }),
      config
    )
    expect(processed.city).toBe('Palos Heights')
    expect(processed.state).toBe('IL')
  })

  it('recovers address from YSTM listing slug when addressRaw missing but slug is a concrete street', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl:
          'https://yardsaletreasuremap.com/US/Illinois/Chicago/15200-S-80th-Ave/161028326/listing.html',
        addressRaw: null,
        cityHint: 'Chicago',
        stateHint: 'IL',
      }),
      config
    )
    expect(processed.resolvedAddressRaw).toMatch(/15200 s 80th ave.*chicago.*il/i)
    expect(processed.normalizedAddress).toMatch(/15200 s 80th ave.*chicago.*il/i)
    expect(processed.status).toBe('needs_geocode')
    expect(processed.failureReasons).not.toContain('missing_address')
    const diag = processed.ingestionDiagnostics as {
      addressSources?: string[]
      authority?: { streetConcrete?: boolean }
    }
    expect(diag.addressSources).toContain('slug_with_url_municipality')
    expect(diag.authority?.streetConcrete).toBe(true)
  })

  it('extension-style rawPayload is optional; sourceUrl + addressRaw drive YSTM authority', async () => {
    const processed = await processIngestedSale(
      raw({
        sourceUrl:
          'https://yardsaletreasuremap.com/US/Indiana/Saint-John/200-Oak/38730022/listing.html',
        addressRaw: '99 Oak, Saint John, IN 46373',
        cityHint: 'Saint John',
        stateHint: 'IN',
        rawPayload: {
          ystmListingCityAuthority: {
            pathCitySlug: 'Saint-John',
            citySource: 'listing_url',
            cityConflict: false,
          },
        },
      }),
      config
    )
    expect(processed.city).toBe('Saint John')
    expect(processed.state).toBe('IN')
  })

  it('uses normalized cityConfig when hints empty', async () => {
    const cfg: CityIngestionConfig = {
      ...config,
      city: '  new   york ',
      state: 'new york',
    }
    const processed = await processIngestedSale(raw({ cityHint: '', stateHint: '' }), cfg)
    expect(processed.city).toBe('New York')
    expect(processed.state).toBe('NY')
  })

  it('does not alter addressRaw-derived normalizedAddress casing pattern', async () => {
    const processed = await processIngestedSale(
      raw({ addressRaw: '  99 Oak Ave  ', cityHint: 'louisville', stateHint: 'ky' }),
      config
    )
    expect(processed.normalizedAddress).toBe('99 oak ave')
    expect(processed.city).toBe('Louisville')
    expect(processed.state).toBe('KY')
  })
})
