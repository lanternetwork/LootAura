import { describe, it, expect } from 'vitest'
import {
  getThisWeekendWindowInMetro,
  getMetroLocalDate,
  saleOverlapsDateRange,
} from '@/lib/seo/weekendBoundaries'

describe('weekendBoundaries', () => {
  it('computes this weekend for Friday in America/Chicago', () => {
    // 2026-05-29 is Friday in US
    const friday = new Date('2026-05-29T18:00:00Z')
    const window = getThisWeekendWindowInMetro('America/Chicago', friday)
    expect(window.start).toBe('2026-05-30')
    expect(window.end).toBe('2026-05-31')
  })

  it('computes this weekend on Sunday as Sat–Sun including today', () => {
    const sunday = new Date('2026-05-31T15:00:00Z')
    const window = getThisWeekendWindowInMetro('America/Chicago', sunday)
    expect(window.start).toBe('2026-05-30')
    expect(window.end).toBe('2026-05-31')
  })

  it('uses metro timezone not UTC for calendar day', () => {
    // Late UTC Sunday can still be Saturday evening in Phoenix
    const instant = new Date('2026-06-01T05:00:00Z')
    const chicago = getMetroLocalDate('America/Chicago', instant)
    const phoenix = getMetroLocalDate('America/Phoenix', instant)
    expect(chicago.weekday).not.toBe(phoenix.weekday)
  })

  it('detects sale overlap with weekend range', () => {
    expect(
      saleOverlapsDateRange(
        { date_start: '2026-05-30', date_end: '2026-05-30' },
        '2026-05-30',
        '2026-05-31'
      )
    ).toBe(true)
    expect(
      saleOverlapsDateRange(
        { date_start: '2026-06-01', date_end: '2026-06-01' },
        '2026-05-30',
        '2026-05-31'
      )
    ).toBe(false)
  })
})
