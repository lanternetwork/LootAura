import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processIngestedSale } from '@/lib/ingestion/processSale'
import type { CityIngestionConfig, RawExternalSale } from '@/lib/ingestion/types'

const config: CityIngestionConfig = {
  city: 'Oak Lawn',
  state: 'IL',
  timezone: 'America/Chicago',
  enabled: true,
  sourcePlatform: 'external_page_source',
  sourcePages: [],
}

const OAK_LAWN_DESCRIPTION = `
front door at 8am each sale day
Estate sale with furniture and tools.
9:00 am - 3:00 pm
`.trim()

function raw(overrides: Partial<RawExternalSale> = {}): RawExternalSale {
  return {
    sourcePlatform: 'external_page_source',
    sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Oak-Lawn/listing.html',
    externalId: null,
    title: 'Oak Lawn Estate Sale',
    description: OAK_LAWN_DESCRIPTION,
    addressRaw: '9400 S Kostner Ave, Oak Lawn, IL 60453',
    dateRaw: '5/15 - 5/16',
    imageSourceUrl: null,
    rawPayload: {},
    cityHint: 'Oak Lawn',
    stateHint: 'IL',
    ...overrides,
  }
}

describe('processIngestedSale — sale-hour range precedence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves Oak Lawn explicit 9–3 over sign-up 8am', async () => {
    const processed = await processIngestedSale(raw(), config)
    expect(processed.timeStart).toBe('09:00:00')
    expect(processed.timeEnd).toBe('15:00:00')
  })

  it.each([
    ['9:00 AM to 3:00 PM'],
    ['9:00 am – 3:00 pm'],
    ['9am - 3pm'],
  ])('parses sale-hour range format: %s', async (rangeLine) => {
    const processed = await processIngestedSale(
      raw({
        description: `front door at 8am each sale day\n${rangeLine}`,
      }),
      config
    )
    expect(processed.timeStart).toBe('09:00:00')
    expect(processed.timeEnd).toBe('15:00:00')
  })

  it('falls back to lone 8am only when no explicit range exists', async () => {
    const processed = await processIngestedSale(
      raw({ description: 'front door at 8am each sale day' }),
      config
    )
    expect(processed.timeStart).toBe('08:00:00')
    expect(processed.timeEnd).toBe('14:00:00')
  })
})
