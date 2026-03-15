import { describe, it, expect } from 'vitest'
import {
  normalizeZipForValidation,
  batchStatuses,
  deterministicSpread,
  buildBatchReport,
} from '@/lib/admin/testSalesSpread'

describe('normalizeZipForValidation (ZIP validation)', () => {
  it('accepts 5-digit ZIPs', () => {
    expect(normalizeZipForValidation('40202')).toBe('40202')
    expect(normalizeZipForValidation('02115')).toBe('02115')
    expect(normalizeZipForValidation('12345')).toBe('12345')
  })

  it('strips non-digits and takes first 5', () => {
    expect(normalizeZipForValidation('40202-1234')).toBe('40202')
    expect(normalizeZipForValidation('40202')).toBe('40202')
    expect(normalizeZipForValidation('123-45')).toBe('12345')
  })

  it('pads short numeric input with leading zeros', () => {
    expect(normalizeZipForValidation('1')).toBe('00001')
    expect(normalizeZipForValidation('12')).toBe('00012')
    expect(normalizeZipForValidation('1234')).toBe('01234')
  })

  it('returns null for empty or non-numeric-only input', () => {
    expect(normalizeZipForValidation('')).toBe(null)
    expect(normalizeZipForValidation('abc')).toBe(null)
    expect(normalizeZipForValidation('   ')).toBe(null)
  })

})

describe('batchStatuses (count and published-only shape)', () => {
  it('published-only: all published', () => {
    expect(batchStatuses(1, true)).toEqual(['published'])
    expect(batchStatuses(5, true)).toEqual(['published', 'published', 'published', 'published', 'published'])
    expect(batchStatuses(10, true)).toHaveLength(10)
    expect(batchStatuses(10, true).every((s) => s === 'published')).toBe(true)
  })

  it('count 0 returns empty array', () => {
    expect(batchStatuses(0, true)).toEqual([])
    expect(batchStatuses(0, false)).toEqual([])
  })

  it('when not published-only: count 1 is single published', () => {
    expect(batchStatuses(1, false)).toEqual(['published'])
  })

  it('when not published-only: count 2 is published + draft', () => {
    expect(batchStatuses(2, false)).toEqual(['published', 'draft'])
  })

  it('when not published-only: count 3+ has published, then 1 draft, 1 archived', () => {
    const s3 = batchStatuses(3, false)
    expect(s3).toHaveLength(3)
    expect(s3.filter((x) => x === 'published')).toHaveLength(1)
    expect(s3.filter((x) => x === 'draft')).toHaveLength(1)
    expect(s3.filter((x) => x === 'archived')).toHaveLength(1)

    const s5 = batchStatuses(5, false)
    expect(s5).toHaveLength(5)
    expect(s5.filter((x) => x === 'published')).toHaveLength(3)
    expect(s5.filter((x) => x === 'draft')).toHaveLength(1)
    expect(s5.filter((x) => x === 'archived')).toHaveLength(1)
  })
})

describe('deterministicSpread (deterministic coordinate generation)', () => {
  const centerLat = 38.25
  const centerLng = -85.76
  const radius = 0.01

  it('same inputs produce same outputs', () => {
    const a = deterministicSpread(centerLat, centerLng, 8, radius)
    const b = deterministicSpread(centerLat, centerLng, 8, radius)
    expect(a).toHaveLength(8)
    expect(b).toHaveLength(8)
    expect(a).toEqual(b)
  })

  it('count 0 or negative returns empty array', () => {
    expect(deterministicSpread(centerLat, centerLng, 0, radius)).toEqual([])
    expect(deterministicSpread(centerLat, centerLng, -1, radius)).toEqual([])
  })

  it('count 1 returns center point', () => {
    const one = deterministicSpread(centerLat, centerLng, 1, radius)
    expect(one).toEqual([{ lat: centerLat, lng: centerLng }])
  })

  it('radius 0 returns empty (except count 1 handled above)', () => {
    expect(deterministicSpread(centerLat, centerLng, 5, 0)).toEqual([])
  })

  it('larger radius produces wider spread', () => {
    const small = deterministicSpread(centerLat, centerLng, 4, 0.005)
    const large = deterministicSpread(centerLat, centerLng, 4, 0.02)
    const latSpan = (pts: { lat: number }[]) =>
      Math.max(...pts.map((p) => p.lat)) - Math.min(...pts.map((p) => p.lat))
    expect(latSpan(large)).toBeGreaterThan(latSpan(small))
  })

  it('output length equals requested count', () => {
    expect(deterministicSpread(centerLat, centerLng, 6, radius)).toHaveLength(6)
    expect(deterministicSpread(centerLat, centerLng, 50, radius)).toHaveLength(50)
  })
})

describe('buildBatchReport (partial-failure reporting)', () => {
  it('report includes requested, succeeded, zip, city, state, failureMessage', () => {
    const r = buildBatchReport(5, 3, '40202', 'Louisville', 'KY', 'Something failed')
    expect(r.requested).toBe(5)
    expect(r.succeeded).toBe(3)
    expect(r.zip).toBe('40202')
    expect(r.city).toBe('Louisville')
    expect(r.state).toBe('KY')
    expect(r.failureMessage).toBe('Something failed')
  })

  it('partial failure: succeeded < requested and failureMessage set', () => {
    const r = buildBatchReport(10, 7, '90210', 'Beverly Hills', 'CA', 'Rate limit')
    expect(r.succeeded).toBeLessThan(r.requested)
    expect(r.failureMessage).toBe('Rate limit')
  })

  it('full success: failureMessage null', () => {
    const r = buildBatchReport(5, 5, '40202', 'Louisville', 'KY', null)
    expect(r.succeeded).toBe(r.requested)
    expect(r.failureMessage).toBeNull()
  })
})
