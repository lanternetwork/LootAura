import { describe, expect, it } from 'vitest'
import {
  capAddressForPublishSchema,
  isResolvedAddressPublishable,
  roundTimeToNearest30Minutes,
  shouldDeferPublishForPendingAddress,
} from '@/lib/ingestion/publishPreflight'

describe('roundTimeToNearest30Minutes', () => {
  it('keeps :00 and :30 unchanged', () => {
    expect(roundTimeToNearest30Minutes('09:00')).toBe('09:00:00')
    expect(roundTimeToNearest30Minutes('09:30:00')).toBe('09:30:00')
  })

  it('rounds to nearest 30-minute increment', () => {
    expect(roundTimeToNearest30Minutes('09:14')).toBe('09:00:00')
    expect(roundTimeToNearest30Minutes('09:15')).toBe('09:30:00')
    expect(roundTimeToNearest30Minutes('09:44')).toBe('09:30:00')
    expect(roundTimeToNearest30Minutes('09:45')).toBe('10:00:00')
  })

  it('returns null for empty input', () => {
    expect(roundTimeToNearest30Minutes(null)).toBeNull()
    expect(roundTimeToNearest30Minutes('')).toBeNull()
  })
})

describe('capAddressForPublishSchema', () => {
  it('truncates long lines without emptying', () => {
    const long = `${'123 Main Street Extended '.repeat(20)}Springfield, IL`
    const capped = capAddressForPublishSchema(long, 500)
    expect(capped).not.toBeNull()
    expect(capped!.length).toBeLessThanOrEqual(500)
  })
})

describe('isResolvedAddressPublishable', () => {
  it('accepts a street line with city and state', () => {
    expect(
      isResolvedAddressPublishable('620 lincoln ave', 'Winnetka', 'IL')
    ).toBe(true)
  })

  it('rejects missing address', () => {
    expect(isResolvedAddressPublishable(null, 'Winnetka', 'IL')).toBe(false)
  })

  it('rejects placeholder labels', () => {
    expect(
      isResolvedAddressPublishable('address pending', 'Winnetka', 'IL')
    ).toBe(false)
  })
})

describe('shouldDeferPublishForPendingAddress', () => {
  it('defers when normalized address is missing', () => {
    expect(
      shouldDeferPublishForPendingAddress({
        normalized_address: null,
        city: 'Santa Ana',
        state: 'CA',
        source_url:
          'https://yardsaletreasuremap.com/US/California/Santa-Ana/See-source-for-address-after-2026-05-27-06%3A00%3A00/38690519/userlisting.html',
      })
    ).toBe(true)
  })

  it('does not defer when address is publishable', () => {
    expect(
      shouldDeferPublishForPendingAddress({
        normalized_address: '2249 us-17',
        city: 'Little River',
        state: 'SC',
      })
    ).toBe(false)
  })
})
