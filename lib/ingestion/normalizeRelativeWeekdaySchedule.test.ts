import { describe, it, expect } from 'vitest'
import {
  isRelativeWeekdayScheduleSyntaxOnly,
  normalizeRelativeWeekdaySchedule,
} from '@/lib/ingestion/normalizeRelativeWeekdaySchedule'

describe('normalizeRelativeWeekdaySchedule', () => {
  it('same-day single Saturday when anchor local day is Saturday (Chicago)', () => {
    const anchorDate = new Date('2026-05-09T17:00:00Z') // Sat local Chicago
    const r = normalizeRelativeWeekdaySchedule({
      rawText: 'Saturday',
      anchorDate,
      timezone: 'America/Chicago',
    })
    expect(r).not.toBeNull()
    expect(r!.dateStart).toBe('2026-05-09')
    expect(r!.dateEnd).toBeNull()
    expect(r!.diagnostics.rolloverReason).toBe('same_day')
  })

  it('next Saturday when anchor local Friday', () => {
    const anchorDate = new Date('2026-05-08T17:00:00Z') // Fri Chicago
    const r = normalizeRelativeWeekdaySchedule({
      rawText: 'Sat',
      anchorDate,
      timezone: 'America/Chicago',
    })
    expect(r!.dateStart).toBe('2026-05-09')
    expect(r!.diagnostics.rolloverReason).toBe('next_occurrence')
  })

  it('resolves Fri–Sun contiguous block from Wednesday anchor', () => {
    const anchorDate = new Date('2026-05-06T17:00:00Z') // Wed Chicago
    const r = normalizeRelativeWeekdaySchedule({
      rawText: 'Fri–Sun',
      anchorDate,
      timezone: 'America/Chicago',
    })
    expect(r!.dateStart).toBe('2026-05-08')
    expect(r!.dateEnd).toBe('2026-05-10')
  })

  it('year rollover: block from late December anchor', () => {
    const anchorDate = new Date('2026-12-30T18:00:00Z') // Wed Chicago
    const r = normalizeRelativeWeekdaySchedule({
      rawText: 'Thu-Fri-Sat',
      anchorDate,
      timezone: 'America/Chicago',
    })
    expect(r!.dateStart).toBe('2026-12-31')
    expect(r!.dateEnd).toBe('2027-01-02')
  })

  it('anchor civil day differs by timezone (UTC vs Chicago)', () => {
    // 04:00Z on May 9 is still civil Fri in Chicago (CDT), but already Sat in UTC.
    const anchorDate = new Date('2026-05-09T04:00:00Z')
    const chicago = normalizeRelativeWeekdaySchedule({
      rawText: 'Saturday',
      anchorDate,
      timezone: 'America/Chicago',
    })
    expect(chicago!.dateStart).toBe('2026-05-09')
    expect(chicago!.diagnostics.anchorLocalYmd).toBe('2026-05-08')

    const utc = normalizeRelativeWeekdaySchedule({
      rawText: 'Saturday',
      anchorDate,
      timezone: 'UTC',
    })
    expect(utc!.dateStart).toBe('2026-05-09')
    expect(utc!.diagnostics.anchorLocalYmd).toBe('2026-05-09')
  })

  it('fails closed on non-contiguous Mon Wed Thu', () => {
    const r = normalizeRelativeWeekdaySchedule({
      rawText: 'Mon Wed Thu',
      anchorDate: new Date('2026-05-11T12:00:00Z'),
      timezone: 'America/Chicago',
    })
    expect(r).toBeNull()
  })

  it('fails closed on junk mixed with weekdays', () => {
    expect(
      normalizeRelativeWeekdaySchedule({
        rawText: 'Sale Sat Sun',
        anchorDate: new Date('2026-05-11T12:00:00Z'),
        timezone: 'America/Chicago',
      })
    ).toBeNull()
  })

  it('fails closed on invalid timezone', () => {
    expect(
      normalizeRelativeWeekdaySchedule({
        rawText: 'Sat',
        anchorDate: new Date('2026-05-11T12:00:00Z'),
        timezone: 'Not/A_Zone',
      })
    ).toBeNull()
  })

  it('syntax-only accepts Thu-Sat with en-dash normalized', () => {
    expect(isRelativeWeekdayScheduleSyntaxOnly('Thu–Sat')).toBe(true)
  })

  it('syntax-only rejects Mon Tue Thu', () => {
    expect(isRelativeWeekdayScheduleSyntaxOnly('Mon Tue Thu')).toBe(false)
  })
})
