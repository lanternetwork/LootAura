import { describe, expect, it } from 'vitest'
import {
  extractAuthoritativeSaleHourRangeFromText,
  isStandaloneSaleHourRangeLine,
  textContainsSaleHourRange,
} from '@/lib/ingestion/saleHourRangeFromText'

const OAK_LAWN_BODY = `
front door at 8am each sale day
Lots of furniture and housewares.
9:00 am - 3:00 pm
5/15 - 5/16
`.trim()

describe('saleHourRangeFromText', () => {
  it('detects standalone and inline sale-hour ranges', () => {
    expect(isStandaloneSaleHourRangeLine('9:00 am - 3:00 pm')).toBe(true)
    expect(isStandaloneSaleHourRangeLine('9am - 3pm')).toBe(true)
    expect(isStandaloneSaleHourRangeLine('Lots of furniture')).toBe(false)
    expect(textContainsSaleHourRange(OAK_LAWN_BODY)).toBe(true)
  })

  it('prefers explicit sale-hour range over sign-up 8am (Oak Lawn)', () => {
    const range = extractAuthoritativeSaleHourRangeFromText(OAK_LAWN_BODY)
    expect(range).toEqual({ timeStart: '09:00:00', timeEnd: '15:00:00' })
  })

  it.each([
    ['9:00 AM to 3:00 PM', '09:00:00', '15:00:00'],
    ['9:00 am – 3:00 pm', '09:00:00', '15:00:00'],
    ['9am - 3pm', '09:00:00', '15:00:00'],
  ] as const)('parses %s', (text, timeStart, timeEnd) => {
    expect(extractAuthoritativeSaleHourRangeFromText(text)).toEqual({ timeStart, timeEnd })
  })

  it('returns null when no explicit range exists', () => {
    expect(extractAuthoritativeSaleHourRangeFromText('front door at 8am each sale day')).toBeNull()
  })

  it('uses the last explicit range when multiple appear', () => {
    const text = 'Preview 8am - 10am. Sale hours 9:00 am - 3:00 pm.'
    expect(extractAuthoritativeSaleHourRangeFromText(text)).toEqual({
      timeStart: '09:00:00',
      timeEnd: '15:00:00',
    })
  })
})
