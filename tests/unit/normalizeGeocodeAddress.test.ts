import { describe, expect, it } from 'vitest'
import {
  hasUsZipInAddressLine,
  isIntersectionOrHighwayLine,
  normalizeGeocodeAddressLine,
  stripZipFromAddressLine,
} from '@/lib/geocode/normalizeGeocodeAddress'

describe('normalizeGeocodeAddress', () => {
  it('normalizes trailing directionals on street segment', () => {
    expect(normalizeGeocodeAddressLine('123 Main St N')).toBe('123 Main St N')
    expect(normalizeGeocodeAddressLine('500 oak ave sw')).toContain('SW')
  })

  it('detects and normalizes intersection lines', () => {
    const line = 'Main St & Oak Ave'
    expect(isIntersectionOrHighwayLine(line)).toBe(true)
    expect(normalizeGeocodeAddressLine(line)).toContain('&')
  })

  it('strips ZIP when state matches hint', () => {
    const raw = '123 Oak St, Orland Park, IL 60464'
    expect(hasUsZipInAddressLine(raw, 'IL')).toBe(true)
    expect(stripZipFromAddressLine(raw, 'IL')).toBe('123 Oak St, Orland Park, IL')
  })

  it('does not strip ZIP when state hint mismatches', () => {
    const raw = '123 Oak St, Chicago, IL 60601'
    expect(stripZipFromAddressLine(raw, 'KY')).toBeNull()
  })
})
