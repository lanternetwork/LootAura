import { describe, expect, it } from 'vitest'
import { computeSaleEndsAt, parseClockToHms } from '@/lib/sales/computeSaleEndsAt'

describe('parseClockToHms', () => {
  it('parses HH:mm and HH:mm:ss', () => {
    expect(parseClockToHms('9:30')).toEqual({ h: 9, mi: 30, s: 0 })
    expect(parseClockToHms('09:30:45')).toEqual({ h: 9, mi: 30, s: 45 })
  })

  it('returns null for invalid', () => {
    expect(parseClockToHms('')).toBeNull()
    expect(parseClockToHms('25:00')).toBeNull()
    expect(parseClockToHms('12:60')).toBeNull()
  })
})

describe('computeSaleEndsAt', () => {
  it('rejects invalid IANA timezone (fail closed)', () => {
    const r = computeSaleEndsAt({
      date_start: '2026-06-15',
      time_start: '09:00:00',
      date_end: null,
      time_end: '12:00:00',
      listingTimezone: 'Not_A_Real_Zone/Ever',
    })
    expect(r).toEqual({ ok: false, reason: 'invalid_timezone' })
  })

  it('uses date_start as effective end date when date_end is null (single-day)', () => {
    const r = computeSaleEndsAt({
      date_start: '2026-06-15',
      time_start: '09:00:00',
      date_end: null,
      time_end: '14:30:00',
      listingTimezone: 'America/Chicago',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.endsAtIso).toBe('2026-06-15T19:30:00.000Z')
    }
  })

  it('uses date_end for multi-day sales', () => {
    const r = computeSaleEndsAt({
      date_start: '2026-06-10',
      time_start: '09:00:00',
      date_end: '2026-06-12',
      time_end: '17:00:00',
      listingTimezone: 'America/Chicago',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.endsAtIso).toBe('2026-06-12T22:00:00.000Z')
    }
  })

  it('treats missing time_end as local end-of-day on effective end date', () => {
    const r = computeSaleEndsAt({
      date_start: '2026-01-10',
      time_start: '09:00:00',
      date_end: '2026-01-12',
      time_end: null,
      listingTimezone: 'America/Chicago',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.endsAtIso).toBe('2026-01-13T05:59:59.000Z')
    }
  })

  it('handles DST wall clock in America/New_York (summer EDT)', () => {
    const r = computeSaleEndsAt({
      date_start: '2024-07-04',
      time_start: '09:00:00',
      date_end: null,
      time_end: '23:59:59',
      listingTimezone: 'America/New_York',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.endsAtIso).toBe('2024-07-05T03:59:59.000Z')
    }
  })
})
