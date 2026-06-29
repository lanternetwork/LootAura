import { describe, expect, it } from 'vitest'
import {
  extractAuthoritativeSaleHourRangeFromText,
  extractStandaloneSaleStartTimeFromText,
  extractYstmDetailSaleHoursFromText,
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

describe('extractYstmDetailSaleHoursFromText', () => {
  it('prefers explicit range over standalone start time', () => {
    const text = 'Start time: 8am\n9:00 am - 3:00 pm'
    expect(extractYstmDetailSaleHoursFromText(text)).toEqual({
      timeStart: '09:00:00',
      timeEnd: '15:00:00',
    })
  })

  it('parses standalone Start time: 8am', () => {
    expect(extractYstmDetailSaleHoursFromText('Sun 6/28\nStart time: 8am')).toEqual({
      timeStart: '08:00:00',
      timeEnd: null,
    })
  })

  it('parses standalone Start time after br-collapsed date line', () => {
    expect(extractYstmDetailSaleHoursFromText('6/28 - 6/28Start time: 8am')).toEqual({
      timeStart: '08:00:00',
      timeEnd: null,
    })
  })

  it.each([
    ['Start time 8 AM', '08:00:00'],
    ['Starts at 8am', '08:00:00'],
    ['Begins at 8:30 AM', '08:30:00'],
    ['Sale starts 7:00am', '07:00:00'],
    ['Start time:  8am', '08:00:00'],
    ['START TIME: 8AM', '08:00:00'],
  ] as const)('parses standalone pattern %s', (text, timeStart) => {
    expect(extractYstmDetailSaleHoursFromText(text)).toEqual({
      timeStart,
      timeEnd: null,
    })
  })

  it('does not treat unrelated at-8am prose as a sale start', () => {
    expect(extractStandaloneSaleStartTimeFromText('front door at 8am each sale day')).toBeNull()
    expect(extractYstmDetailSaleHoursFromText('Lots of furniture. Open at 8am for early birds.')).toBeNull()
  })

  it('does not treat Neighborhood Sale title plus Start time as sale starts', () => {
    expect(
      extractYstmDetailSaleHoursFromText('Neighborhood Sale\n6/28 - 6/28\nStart time: 8am')
    ).toEqual({
      timeStart: '08:00:00',
      timeEnd: null,
    })
  })

  it('uses the last standalone start phrase when several appear', () => {
    expect(extractYstmDetailSaleHoursFromText('Start time: 8am. Starts at 9:30am')).toEqual({
      timeStart: '09:30:00',
      timeEnd: null,
    })
  })
})
