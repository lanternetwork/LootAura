import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processIngestedSale } from '@/lib/ingestion/processSale'
import type { CityIngestionConfig, RawExternalSale } from '@/lib/ingestion/types'

const homewoodConfig: CityIngestionConfig = {
  city: 'Homewood',
  state: 'IL',
  timezone: 'America/Chicago',
  enabled: true,
  sourcePlatform: 'external_page_source',
  sourcePages: [],
}

function baseRaw(overrides: Partial<RawExternalSale> = {}): RawExternalSale {
  return {
    sourcePlatform: 'external_page_source',
    sourceUrl: 'https://example.test/listing.html',
    externalId: null,
    title: 'Community sale',
    description: null,
    addressRaw: '18624 Page Ave, Homewood, IL 60430, USA',
    dateRaw: null,
    imageSourceUrl: null,
    rawPayload: {},
    cityHint: 'Homewood',
    stateHint: 'IL',
    ...overrides,
  }
}

describe('processIngestedSale — external listing date/time (weekday M/D, start time line)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not emit invalid_date for Sat 5/2 + Start time: 8am; status needs_geocode', async () => {
    const raw = baseRaw({
      dateRaw: 'Sat 5/2',
      description: 'Start time: 8am',
    })
    const processed = await processIngestedSale(raw, homewoodConfig)

    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.failureReasons).not.toContain('missing_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.dateEnd).toBeNull()
    expect(processed.timeStart).toBe('08:00:00')
    expect(processed.timeEnd).toBe('14:00:00')
    expect(processed.timeSource).toBe('explicit')
    expect(processed.status).toBe('needs_geocode')
  })

  it('finds weekday date in description when dateRaw is empty', async () => {
    const raw = baseRaw({
      dateRaw: null,
      description: 'Sat 5/2\nStart time: 8am',
    })
    const processed = await processIngestedSale(raw, homewoodConfig)

    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.timeStart).toBe('08:00:00')
    expect(processed.timeEnd).toBe('14:00:00')
    expect(processed.status).toBe('needs_geocode')
  })

  it('parses same dates/times regardless of ordering in text', async () => {
    const rawA = baseRaw({
      dateRaw: null,
      description: '8:00 am - 3:00 pm 5/1 - 5/2',
    })
    const rawB = baseRaw({
      dateRaw: null,
      description: '5/1 - 5/2 8:00 am - 3:00 pm',
    })
    const a = await processIngestedSale(rawA, homewoodConfig)
    const b = await processIngestedSale(rawB, homewoodConfig)

    expect(a.dateStart).toBe('2026-05-01')
    expect(a.dateEnd).toBe('2026-05-02')
    expect(a.timeStart).toBe('08:00:00')
    expect(a.timeEnd).toBe('15:00:00')
    expect(b.dateStart).toEqual(a.dateStart)
    expect(b.dateEnd).toEqual(a.dateEnd)
    expect(b.timeStart).toEqual(a.timeStart)
    expect(b.timeEnd).toEqual(a.timeEnd)
  })

  it('parses Tue 4/28 with 4pm from same blob', async () => {
    const raw = baseRaw({
      dateRaw: null,
      description: 'Tue 4/28 Start time: 4pm',
    })
    const processed = await processIngestedSale(raw, homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-04-28')
    expect(processed.timeStart).toBe('16:00:00')
    expect(processed.timeEnd).toBe('14:00:00')
    expect(processed.timeSource).toBe('explicit')
  })

  it('parses ISO YYYY-MM-DD with explicit year', async () => {
    const raw = baseRaw({
      dateRaw: '2026-05-10',
      description: null,
    })
    const processed = await processIngestedSale(raw, homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-10')
    expect(processed.dateEnd).toBeNull()
  })

  it('parses M/D/YYYY without duplicating inner M/D', async () => {
    const raw = baseRaw({
      dateRaw: null,
      description: 'Opens 5/1/2026 at 9am',
    })
    const processed = await processIngestedSale(raw, homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-01')
    expect(processed.dateEnd).toBeNull()
  })

  it('normalizes unicode dashes + NBSP to parse identically', async () => {
    const nbsp = '\u00A0'
    const a = await processIngestedSale(
      baseRaw({ description: `5/2 -${nbsp}5/3 9:00 am - 5:00 pm` }),
      homewoodConfig
    )
    const b = await processIngestedSale(
      baseRaw({ description: '5/2 – 5/3 9:00 am — 5:00 pm' }),
      homewoodConfig
    )

    expect(a.failureReasons).not.toContain('invalid_date')
    expect(b.failureReasons).not.toContain('invalid_date')
    expect(a.dateStart).toBe('2026-05-02')
    expect(a.dateEnd).toBe('2026-05-03')
    expect(b.dateStart).toEqual(a.dateStart)
    expect(b.dateEnd).toEqual(a.dateEnd)
    expect(b.timeStart).toEqual(a.timeStart)
    expect(b.timeEnd).toEqual(a.timeEnd)
  })

  it('supports single explicit 5pm time with default end', async () => {
    const processed = await processIngestedSale(
      baseRaw({ description: '5/2 sale starts 5pm' }),
      homewoodConfig
    )
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.timeStart).toBe('17:00:00')
    expect(processed.timeEnd).toBe('14:00:00')
  })

  it('treats invalid date tokens as invalid_date without throwing', async () => {
    const processed = await processIngestedSale(
      baseRaw({ description: 'Open 99/99 8:00 am - 3:00 pm' }),
      homewoodConfig
    )
    expect(processed.failureReasons).toContain('invalid_date')
    expect(processed.dateStart).toBeNull()
    expect(processed.status).toBe('needs_check')
  })

  it('parses single month-name date', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'May 2' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
  })

  it('parses month-name with ordinal suffix', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'May 2nd' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
  })

  it('parses month-name with weekday prefix', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'Monday, May 4' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-04')
  })

  it('parses full month-name range with hyphen', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'May 2 - May 4' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.dateEnd).toBe('2026-05-04')
  })

  it('parses compact month-name range', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'May 2-4' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.dateEnd).toBe('2026-05-04')
  })

  it('parses month-name range with to keyword', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'May 2 to May 4' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.dateEnd).toBe('2026-05-04')
  })

  it('parses month-name with explicit time range', async () => {
    const processed = await processIngestedSale(
      baseRaw({ description: 'May 2\n8:00 am - 3:00 pm' }),
      homewoodConfig
    )
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.timeStart).toBe('08:00:00')
    expect(processed.timeEnd).toBe('15:00:00')
  })

  it('keeps index ordering across numeric and month-name candidates', async () => {
    const processed = await processIngestedSale(baseRaw({ description: '5/1 - 5/2 May 3' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-01')
    expect(processed.dateEnd).toBe('2026-05-03')
  })

  it('parses month-name range with unicode dash', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'May 2 – May 4' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.dateEnd).toBe('2026-05-04')
  })

  it('parses weekday-prefixed numeric date', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'Tue 4/28' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-04-28')
  })

  it('parses numeric date inline with surrounding text', async () => {
    const processed = await processIngestedSale(
      baseRaw({ description: 'Tuesday night sale Tue 4/28' }),
      homewoodConfig
    )
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-04-28')
  })

  it('parses numeric date after newlines', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'Some text\n\n4/28' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-04-28')
  })

  it('parses punctuation-adjacent numeric date', async () => {
    const processed = await processIngestedSale(baseRaw({ description: 'Sale date: 4/28.' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-04-28')
  })

  it('parses numeric date with nearby time token', async () => {
    const processed = await processIngestedSale(baseRaw({ description: '4:00 pm Tue 4/28' }), homewoodConfig)
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-04-28')
    expect(processed.timeStart).toBe('16:00:00')
  })

  it('parses explicit range 5/2 - 5/3 with nearby time without invalid_date', async () => {
    const processed = await processIngestedSale(
      baseRaw({ description: '8:30 am - 5:00 pm\n\n5/2 - 5/3' }),
      homewoodConfig
    )
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.dateEnd).toBe('2026-05-03')
    expect(processed.timeStart).toBe('08:30:00')
    expect(processed.timeEnd).toBe('17:00:00')
  })

  it('parses visually identical date range when slash glyphs are non-ascii', async () => {
    const processed = await processIngestedSale(
      baseRaw({ description: '8:30 am - 5:00 pm 5⁄2 - 5⁄3' }),
      homewoodConfig
    )
    expect(processed.failureReasons).not.toContain('invalid_date')
    expect(processed.dateStart).toBe('2026-05-02')
    expect(processed.dateEnd).toBe('2026-05-03')
  })
})
