import { describe, expect, it, vi } from 'vitest'
import {
  hasPastEndDate,
  isSaleWindowExpiredAtDiscovery,
} from '@/lib/ingestion/saleWindowDates'

describe('saleWindowDates', () => {
  it('treats past date_end as expired', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T12:00:00.000Z'))
    expect(hasPastEndDate('2026-05-16')).toBe(true)
    expect(hasPastEndDate('2026-05-17')).toBe(false)
    expect(isSaleWindowExpiredAtDiscovery('2026-05-10', '2026-05-16')).toBe(true)
    vi.useRealTimers()
  })

  it('uses start date when end missing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T12:00:00.000Z'))
    expect(isSaleWindowExpiredAtDiscovery('2026-05-10', null)).toBe(true)
    expect(isSaleWindowExpiredAtDiscovery('2026-05-20', null)).toBe(false)
    vi.useRealTimers()
  })
})
